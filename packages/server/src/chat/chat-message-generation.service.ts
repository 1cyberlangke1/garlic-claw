import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import type {
  ChatBeforeModelRequest,
  ChatMessagePart,
} from '@garlic-claw/shared';
import { AiProviderService } from '../ai/ai-provider.service';
import { PersonaService } from '../persona/persona.service';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillCommandService } from '../skill/skill-command.service';
import {
  CHAT_SYSTEM_PROMPT,
  hasActiveAssistantMessage,
  toRuntimeMessages,
  toUserMessageInput,
} from './chat-message.helpers';
import { ChatMessageCompletionService } from './chat-message-completion.service';
import {
  assertConversationLlmEnabled,
  createChatLifecycleContext,
  getOwnedConversationMessage,
  touchConversationTimestamp,
} from './chat-message-common.helpers';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import { prepareSendMessagePayload } from './chat-message-session';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import { ChatService } from './chat.service';
import { type RetryMessageDto, type SendMessageDto } from './dto/chat.dto';
import { deserializeMessageParts, serializeMessageParts } from './message-parts';
import { ChatTaskService } from './chat-task.service';

@Injectable()
export class ChatMessageGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
    private readonly personaService: PersonaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly modelInvocation: ChatModelInvocationService,
    private readonly orchestration: ChatMessageOrchestrationService,
    private readonly chatTaskService: ChatTaskService,
    private readonly completionService: ChatMessageCompletionService,
    private readonly skillCommands: SkillCommandService,
  ) {}

  async startMessageGeneration(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    assertConversationLlmEnabled(conversation);
    if (hasActiveAssistantMessage(conversation.messages)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }

    const payload = prepareSendMessagePayload({
      history: conversation.messages,
      input: toUserMessageInput(dto.parts, dto.content),
    });
    const initialModelConfig = this.aiProvider.getModelConfig(dto.provider, dto.model);
    const resolvedPersona = await this.buildSystemPrompt(conversationId);
    const messageReceivedContext = createChatLifecycleContext({
      userId,
      conversationId,
      activeProviderId: initialModelConfig.providerId,
      activeModelId: initialModelConfig.id,
      activePersonaId: resolvedPersona.activePersonaId,
    });
    const baseReceivedPayload = {
      context: messageReceivedContext,
      conversationId,
      providerId: initialModelConfig.providerId,
      modelId: initialModelConfig.id,
      message: {
        role: 'user' as const,
        content: payload.persistedMessage.content,
        parts: deserializeMessageParts(payload.persistedMessage.partsJson),
      },
      modelMessages: payload.modelMessages,
    };
    const skillCommandResult = await this.skillCommands.tryHandleMessage({
      userId,
      conversationId,
      messageText: baseReceivedPayload.message.content ?? '',
    });
    const receivedMessageResult = skillCommandResult
      ? {
          action: 'short-circuit' as const,
          payload: baseReceivedPayload,
          assistantContent: skillCommandResult.assistantContent,
          assistantParts: skillCommandResult.assistantParts,
          providerId: skillCommandResult.providerId,
          modelId: skillCommandResult.modelId,
        }
      : await this.pluginRuntime.runMessageReceivedHooks({
          context: messageReceivedContext,
          payload: baseReceivedPayload,
        });
    const receivedMessagePayload = receivedMessageResult.payload;
    const modelConfig = this.aiProvider.getModelConfig(
      receivedMessagePayload.providerId,
      receivedMessagePayload.modelId,
    );
    const messageCreatedContext = createChatLifecycleContext({
      userId,
      conversationId,
      activeProviderId: modelConfig.providerId,
      activeModelId: modelConfig.id,
      activePersonaId: resolvedPersona.activePersonaId,
    });
    const createdMessagePayload = await this.pluginRuntime.runMessageCreatedHooks({
      context: messageCreatedContext,
      payload: {
        context: messageCreatedContext,
        conversationId,
        message: {
          role: 'user',
          content: receivedMessagePayload.message.content,
          parts: receivedMessagePayload.message.parts,
          status: 'completed',
        },
        modelMessages: receivedMessagePayload.modelMessages,
      },
    });

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: createdMessagePayload.message.content ?? '',
        partsJson: serializeMessageParts(createdMessagePayload.message.parts),
        status: createdMessagePayload.message.status ?? 'completed',
      },
    });
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
      },
    });
    await touchConversationTimestamp(this.prisma, conversationId);

    try {
      if (receivedMessageResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completeShortCircuitedAssistant({
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          activePersonaId: resolvedPersona.activePersonaId,
          providerId: receivedMessageResult.providerId,
          modelId: receivedMessageResult.modelId,
          assistantContent: receivedMessageResult.assistantContent,
          assistantParts: receivedMessageResult.assistantParts,
        });
        return {
          userMessage,
          assistantMessage: completedAssistantMessage,
        };
      }

      const beforeModelResult = await this.orchestration.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: createdMessagePayload.modelMessages as ChatRuntimeMessage[],
      });
      if (beforeModelResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completeShortCircuitedAssistant({
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          activePersonaId: resolvedPersona.activePersonaId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          assistantContent: beforeModelResult.assistantContent,
          assistantParts: beforeModelResult.assistantParts,
        });
        return {
          userMessage,
          assistantMessage: completedAssistantMessage,
        };
      }

      const preparedInvocation = await this.modelInvocation.prepareResolved({
        conversationId,
        modelConfig: beforeModelResult.modelConfig,
        messages: beforeModelResult.request.messages,
      });
      const {
        userMessage: userMessageWithMetadata,
        assistantMessage: assistantMessageWithMetadata,
      } = await this.completionService.applyVisionFallbackMetadata({
        userMessage,
        assistantMessage,
        visionFallbackEntries:
          preparedInvocation.transformResult?.visionFallback?.entries ?? [],
      });
      this.startPreparedGenerationTask({
        assistantMessageId: assistantMessageWithMetadata.id,
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        beforeModelResult,
        preparedInvocation,
      });
      return {
        userMessage: userMessageWithMetadata,
        assistantMessage: assistantMessageWithMetadata,
      };
    } catch (error) {
      await this.markAssistantMessageAsError(assistantMessage.id, conversationId, error);
      throw error;
    }
  }

  async stopMessageGeneration(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    const { message } = await getOwnedConversationMessage(
      this.chatService,
      userId,
      conversationId,
      messageId,
    );
    if (message.role !== 'assistant') {
      throw new BadRequestException('只有 AI 回复消息可以停止');
    }

    const stopped = await this.chatTaskService.stopTask(messageId);
    if (!stopped && (message.status === 'pending' || message.status === 'streaming')) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'stopped',
          error: null,
        },
      });
      await touchConversationTimestamp(this.prisma, conversationId);
    }

    return this.prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  }

  async retryMessageGeneration(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: RetryMessageDto,
  ) {
    const { conversation, message } = await getOwnedConversationMessage(
      this.chatService,
      userId,
      conversationId,
      messageId,
    );
    assertConversationLlmEnabled(conversation);
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.id !== messageId || message.role !== 'assistant') {
      throw new BadRequestException('只能重试最后一条 AI 回复');
    }

    await this.chatTaskService.stopTask(messageId);

    const providerId = dto.provider ?? message.provider;
    const modelId = dto.model ?? message.model;
    if (!providerId || !modelId) {
      throw new BadRequestException('缺少重试所需的 provider/model');
    }

    const historyMessages = conversation.messages.slice(0, -1);
    const modelConfig = this.aiProvider.getModelConfig(providerId, modelId);
    const assistantMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
        error: null,
        toolCalls: null,
        toolResults: null,
        metadataJson: null,
      },
    });
    await touchConversationTimestamp(this.prisma, conversationId);

    try {
      const runtimeMessages = toRuntimeMessages(historyMessages);
      const resolvedPersona = await this.buildSystemPrompt(conversationId);
      const beforeModelResult = await this.orchestration.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: runtimeMessages,
      });
      if (beforeModelResult.action === 'short-circuit') {
        return this.completeShortCircuitedAssistant({
          assistantMessageId: messageId,
          userId,
          conversationId,
          activePersonaId: resolvedPersona.activePersonaId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          assistantContent: beforeModelResult.assistantContent,
          assistantParts: beforeModelResult.assistantParts,
        });
      }

      const preparedInvocation = await this.modelInvocation.prepareResolved({
        conversationId,
        modelConfig: beforeModelResult.modelConfig,
        messages: beforeModelResult.request.messages,
      });
      const assistantMessageWithMetadata =
        await this.completionService.applyVisionFallbackMetadataToAssistant({
          assistantMessage,
          visionFallbackEntries:
            preparedInvocation.transformResult?.visionFallback?.entries ?? [],
        });
      this.startPreparedGenerationTask({
        assistantMessageId: assistantMessageWithMetadata.id,
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        beforeModelResult,
        preparedInvocation,
      });
      return assistantMessageWithMetadata;
    } catch (error) {
      await this.markAssistantMessageAsError(messageId, conversationId, error);
      throw error;
    }
  }

  private async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    providerId: string;
    modelId: string;
    assistantContent: string;
    assistantParts?: ChatMessagePart[];
  }) {
    return this.completionService.completeShortCircuitedAssistant(input);
  }

  private startPreparedGenerationTask(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    beforeModelResult: Extract<
      Awaited<ReturnType<ChatMessageOrchestrationService['applyChatBeforeModelHooks']>>,
      { action: 'continue' }
    >;
    preparedInvocation: PreparedChatModelInvocation;
  }) {
    const modelContext = {
      source: 'chat-tool' as const,
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.beforeModelResult.modelConfig.providerId,
      activeModelId: input.beforeModelResult.modelConfig.id,
      activePersonaId: input.activePersonaId,
    };
    const chatToolSet = input.beforeModelResult.modelConfig.capabilities.toolCall
      ? input.beforeModelResult.buildToolSet({
          context: modelContext,
          allowedToolNames: input.beforeModelResult.request.availableTools.map(
            (tool: ChatBeforeModelRequest['availableTools'][number]) => tool.name,
          ),
        })
      : undefined;

    this.chatTaskService.startTask({
      assistantMessageId: input.assistantMessageId,
      conversationId: input.conversationId,
      providerId: input.beforeModelResult.modelConfig.providerId,
      modelId: input.beforeModelResult.modelConfig.id,
      createStream: this.orchestration.buildStreamFactory({
        assistantMessageId: input.assistantMessageId,
        userId: input.userId,
        conversationId: input.conversationId,
        request: input.beforeModelResult.request,
        preparedInvocation: input.preparedInvocation,
        activeProviderId: input.beforeModelResult.modelConfig.providerId,
        activeModelId: input.beforeModelResult.modelConfig.id,
        activePersonaId: input.activePersonaId,
        tools: chatToolSet,
      }),
      onComplete: (result) =>
        this.orchestration.applyFinalResponseHooks({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          responseSource: 'model',
          result,
        }),
      onSent: (result) =>
        this.orchestration.runResponseAfterSendHooks({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          responseSource: 'model',
          result,
        }),
    });
  }

  private async markAssistantMessageAsError(
    messageId: string,
    conversationId: string,
    error: unknown,
  ) {
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误',
      },
    });
    await touchConversationTimestamp(this.prisma, conversationId);
  }

  private async buildSystemPrompt(conversationId: string) {
    const currentPersona = await this.personaService.getCurrentPersona({
      conversationId,
    });

    return {
      systemPrompt: currentPersona.prompt || CHAT_SYSTEM_PROMPT,
      activePersonaId: currentPersona.personaId,
    };
  }
}
