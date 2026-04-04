import {
  createChatModelLifecycleContext,
  createChatLifecycleContext,
  createMessageCreatedHookPayload,
  createPluginMessageHookInfo,
  createPluginMessageHookInfoFromRecord,
  normalizeAssistantMessageOutput,
  type ChatMessagePart,
  type ChatMessageStatus,
  normalizeUserMessageInput,
  type PluginCallContext,
  type PluginLlmMessage,
  type PluginMessageSendInfo,
  type PluginMessageSendParams,
  type PluginMessageTargetInfo,
  type PluginMessageTargetRef,
  serializeMessageParts,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import {
  getOwnedConversationMessage,
  touchConversationTimestamp,
} from './chat-message-common.helpers';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { type UpdateMessageDto } from './dto/chat.dto';
import { mapDtoParts } from './chat-message.helpers';
import { ChatTaskService } from './chat-task.service';

type CreateChatMessageInput = {
  role: 'user' | 'assistant';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
};

type HookableChatMessageInput = CreateChatMessageInput & {
  content: string;
  parts: ChatMessagePart[];
  status: ChatMessageStatus;
};

type MessageRecordWithMetadata = { id: string; metadataJson?: string | null } & Record<string, unknown>;

interface ChatVisionFallbackMetadataEntry { text: string; source: 'cache' | 'generated' }

type ShortCircuitedAssistantOutput = {
  assistantContent: string;
  assistantParts?: ChatMessagePart[];
  providerId: string;
  modelId: string;
};

@Injectable()
export class ChatMessageMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly orchestration: ChatMessageOrchestrationService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

  async startGenerationTurn(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    modelConfig: { providerId: string; id: string };
    receivedMessagePayload: {
      message: {
        content: string | null;
        parts: ChatMessagePart[];
      };
      modelMessages: PluginLlmMessage[];
    };
  }) {
    const { createdMessage: userMessage, modelMessages } =
      await this.createHookedStoredMessage({
        conversationId: input.conversationId,
        hookContext: createChatModelLifecycleContext({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          modelConfig: input.modelConfig,
        }),
        modelMessages: input.receivedMessagePayload.modelMessages,
        touchConversation: false,
        message: {
          role: 'user',
          ...input.receivedMessagePayload.message,
          content: input.receivedMessagePayload.message.content ?? '',
          status: 'completed',
        },
      });

    return {
      userMessage,
      modelMessages,
      assistantMessage: await this.createStoredMessage(
        input.conversationId,
        {
          role: 'assistant',
          content: '',
          provider: input.modelConfig.providerId,
          model: input.modelConfig.id,
          status: 'pending',
        },
      ),
    };
  }

  async getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null> {
    return input.context.conversationId
      ? this.resolveSendMessageTarget(input.context)
      : null;
  }

  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    const target = await this.resolveSendMessageTarget(input.context, input.target);
    return {
      target,
      ...(await this.createConversationTargetAssistantMessage({
        ...input,
        conversationId: target.id,
      })),
    };
  }

  async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    completion: ShortCircuitedAssistantOutput;
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.completion.assistantContent,
      parts: input.completion.assistantParts,
    });
    const finalResult = await this.orchestration.applyFinalResponseHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.completion.providerId,
        modelId: input.completion.modelId,
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
        toolCalls: [],
        toolResults: [],
      },
    });
    const finalAssistantMessage = await this.updateMessageAndTouch(
      input.assistantMessageId,
      input.conversationId,
      {
        content: finalResult.content,
        partsJson: finalResult.parts.length
          ? serializeMessageParts(finalResult.parts)
          : null,
        provider: finalResult.providerId,
        model: finalResult.modelId,
        status: 'completed',
        error: null,
        toolCalls: finalResult.toolCalls.length
          ? JSON.stringify(finalResult.toolCalls)
          : null,
        toolResults: finalResult.toolResults.length
          ? JSON.stringify(finalResult.toolResults)
          : null,
      },
    );
    await this.orchestration.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  async applyVisionFallbackMetadata<
    TUserMessage extends MessageRecordWithMetadata,
    TAssistantMessage extends MessageRecordWithMetadata,
  >(input: {
    userMessage?: TUserMessage | null;
    assistantMessage: TAssistantMessage;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }): Promise<{
    userMessage: TUserMessage | null;
    assistantMessage: TAssistantMessage;
  }> {
    const userMessage = input.userMessage ?? null;
    const metadataJson = await this.persistVisionFallbackMetadata(
      userMessage
        ? [userMessage.id, input.assistantMessage.id]
        : [input.assistantMessage.id],
      input.visionFallbackEntries,
    );
    if (!metadataJson) {
      return {
        userMessage,
        assistantMessage: input.assistantMessage,
      };
    }

    return {
      userMessage: userMessage
        ? {
            ...userMessage,
            metadataJson,
          } as TUserMessage
        : null,
      assistantMessage: {
        ...input.assistantMessage,
        metadataJson,
      } as TAssistantMessage,
    };
  }

  async markAssistantStopped(messageId: string, conversationId: string): Promise<void> {
    await this.updateMessageAndTouch(messageId, conversationId, {
      status: 'stopped',
      error: null,
    });
  }

  async resetAssistantForRetry(input: {
    messageId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
  }) {
    return this.updateMessageAndTouch(input.messageId, input.conversationId, {
      content: '',
      provider: input.providerId,
      model: input.modelId,
      status: 'pending',
      error: null,
      toolCalls: null,
      toolResults: null,
      metadataJson: null,
    });
  }

  async markAssistantError(
    messageId: string,
    conversationId: string,
    error: string,
  ): Promise<void> {
    await this.updateMessageAndTouch(messageId, conversationId, {
      status: 'error',
      error,
    });
  }

  async updateMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
    const { message, hookContext } = await this.prepareOwnedMessageMutation({
      userId,
      conversationId,
      messageId,
    });

    const nextMessage: HookableChatMessageInput = message.role === 'user'
      ? {
          role: 'user',
          ...normalizeUserMessageInput({
            content: dto.content,
            parts: dto.parts ? mapDtoParts(dto.parts) : undefined,
          }),
          status: 'completed',
        }
      : {
          role: 'assistant',
          content: dto.content?.trim() ?? '',
          parts: [],
          provider: message.provider,
          model: message.model,
          status: 'completed',
        };
    const updatedPayload = await this.pluginRuntime.runHook({
      hookName: 'message:updated',
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        currentMessage: createPluginMessageHookInfoFromRecord(message),
        nextMessage: createPluginMessageHookInfo(nextMessage),
      },
    });

    const nextPersistedMessage = updatedPayload.nextMessage;
    const baseData = {
      content: nextPersistedMessage.content ?? '',
      status: nextPersistedMessage.status ?? 'completed',
      error: null,
    };
    return this.updateMessageAndTouch(
      messageId,
      conversationId,
      message.role === 'user'
        ? {
            ...baseData,
            partsJson: serializeMessageParts(nextPersistedMessage.parts),
          }
        : {
            ...baseData,
            provider: nextPersistedMessage.provider ?? message.provider,
            model: nextPersistedMessage.model ?? message.model,
          },
    );
  }

  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    const { message, hookContext } = await this.prepareOwnedMessageMutation({
      userId,
      conversationId,
      messageId,
    });
    await this.pluginRuntime.runBroadcastHook({
      hookName: 'message:deleted',
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        message: createPluginMessageHookInfoFromRecord(message),
      },
    });
    await this.prisma.message.delete({ where: { id: messageId } });
    await touchConversationTimestamp(this.prisma, conversationId);
    return { success: true };
  }

  private async updateMessageAndTouch(
    messageId: string,
    conversationId: string,
    data: Record<string, unknown>,
  ) {
    const result = await this.prisma.message.update({
      where: { id: messageId },
      data,
    });
    await touchConversationTimestamp(this.prisma, conversationId);
    return result;
  }

  private async prepareOwnedMessageMutation(input: {
    userId: string;
    conversationId: string;
    messageId: string;
  }) {
    const { message } = await getOwnedConversationMessage(
      this.chatService,
      input.userId,
      input.conversationId,
      input.messageId,
    );
    await this.chatTaskService.stopTask(input.messageId);
    return {
      message,
      hookContext: createChatLifecycleContext({
        userId: input.userId,
        conversationId: input.conversationId,
      }),
    };
  }

  private async createConversationTargetAssistantMessage(input: {
    context: PluginCallContext;
    conversationId: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<Omit<PluginMessageSendInfo, 'target'>> {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.content,
      parts: input.parts,
    });
    if (!normalizedAssistant.content && normalizedAssistant.parts.length === 0) {
      throw new BadRequestException('message.send 需要非空 content 或 parts');
    }

    const provider = input.provider ?? input.context.activeProviderId ?? null;
    const model = input.model ?? input.context.activeModelId ?? null;
    const { createdMessage } = await this.createHookedStoredMessage({
      conversationId: input.conversationId,
      hookContext: createChatModelLifecycleContext({
        source: input.context.source,
        userId: input.context.userId,
        conversationId: input.conversationId,
        activePersonaId: input.context.activePersonaId,
        modelConfig: { providerId: provider, id: model },
      }),
      message: {
        role: 'assistant',
        ...normalizedAssistant,
        provider,
        model,
        status: 'completed',
      },
    });
    const createdMessageInfo = createPluginMessageHookInfoFromRecord(createdMessage);

    return {
      ...createdMessageInfo,
      id: createdMessage.id,
      role: 'assistant',
      content: createdMessageInfo.content ?? '',
      status: (createdMessageInfo.status ?? 'completed') as PluginMessageSendInfo['status'],
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
    };
  }

  private async resolveSendMessageTarget(
    context: PluginCallContext,
    target?: PluginMessageSendParams['target'],
  ): Promise<PluginMessageTargetInfo> {
    const conversationId = target?.id ?? context.conversationId;
    if (target && target.type !== 'conversation') {
      throw new BadRequestException(`当前不支持消息目标类型 ${target.type}`);
    }
    if (!conversationId) {
      throw new BadRequestException('message.send 需要消息目标上下文');
    }

    const conversation = context.userId
      ? await this.chatService.getConversation(context.userId, conversationId)
      : await this.prisma.conversation.findUnique({
          where: {
            id: conversationId,
          },
          select: {
            id: true,
            title: true,
          },
        });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      type: 'conversation',
      id: conversation.id,
      label: conversation.title,
    };
  }

  private async createHookedStoredMessage(input: {
    conversationId: string;
    hookContext: PluginCallContext;
    modelMessages?: PluginLlmMessage[];
    message: HookableChatMessageInput;
    touchConversation?: boolean;
  }) {
    const createdMessagePayload = await this.pluginRuntime.runHook({
      hookName: 'message:created',
      context: input.hookContext,
      payload: createMessageCreatedHookPayload({
        context: input.hookContext,
        conversationId: input.conversationId,
        message: input.message,
        modelMessages: input.modelMessages ?? [{
          role: input.message.role,
          content: input.message.parts,
        }],
      }),
    });

    return {
      createdMessage: await this.createStoredMessage(
        input.conversationId,
        createdMessagePayload.message as CreateChatMessageInput,
        input.touchConversation,
      ),
      modelMessages: createdMessagePayload.modelMessages,
    };
  }

  private async createStoredMessage(
    conversationId: string,
    message: CreateChatMessageInput,
    touchConversation?: boolean,
  ) {
    const partsJson = message.parts === undefined
      ? undefined
      : message.parts?.length
        ? serializeMessageParts(message.parts)
        : null;
    const created = await this.prisma.message.create({
      data: {
        conversationId,
        role: message.role,
        content: message.content ?? '',
        ...(partsJson !== undefined ? { partsJson } : {}),
        ...(message.role === 'assistant'
          ? {
              ...(message.provider !== undefined
                ? { provider: message.provider ?? null }
                : {}),
              ...(message.model !== undefined
                ? { model: message.model ?? null }
                : {}),
            }
          : {}),
        status: message.status ?? 'completed',
      },
    });
    if (touchConversation !== false) {
      await touchConversationTimestamp(this.prisma, conversationId);
    }
    return created;
  }

  private async persistVisionFallbackMetadata(
    messageIds: readonly string[],
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[],
  ): Promise<string | null> {
    if (visionFallbackEntries.length === 0) {
      return null;
    }

    const metadataJson = JSON.stringify({
      visionFallback: {
        state: 'completed',
        entries: visionFallbackEntries,
      },
    });
    await (messageIds.length === 1
      ? this.prisma.message.update({
          where: { id: messageIds[0] },
          data: { metadataJson },
        })
      : this.prisma.message.updateMany({
          where: {
            id: {
              in: [...messageIds],
            },
          },
          data: { metadataJson },
        }));

    return metadataJson;
  }

}
