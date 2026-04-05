import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { filterAllowedToolNames as filterAuthorAllowedToolNames } from '@garlic-claw/plugin-sdk';
import {
  createChatLifecycleContext,
  createChatModelLifecycleContext,
  createMessageCreatedHookPayload,
  createMessageReceivedHookPayload,
  createPluginMessageHookInfo,
  createPluginMessageHookInfoFromRecord,
  filterChatAvailableTools,
  mergeChatSystemPrompts,
  normalizeAssistantMessageOutput,
  type ChatBeforeModelRequest,
  type ChatMessagePart,
  type MessageCreatedHookPayload,
  type MessageReceivedHookPayload,
  type PluginCallContext,
  type PluginLlmMessage,
  type PluginMessageHookInfo,
  type PluginResponseSource,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import type { AiProviderService, ModelConfig } from '../ai';
import type { SkillSessionService } from '../skill/skill-session.service';
import type { ToolRegistryService } from '../tool/tool-registry.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import type {
  ChatBeforeModelExecutionResult,
  MessageReceivedExecutionResult,
} from './plugin-runtime.types';
import type { CompletedChatTaskResult } from '../chat/chat-task.service';

export type ChatToolSet = Awaited<ReturnType<ToolRegistryService['buildToolSet']>>;

export interface PluginChatMessageInput {
  role: PluginMessageHookInfo['role'];
  content: string;
  parts: ChatMessagePart[];
  status: PluginMessageHookInfo['status'];
  provider?: string | null;
  model?: string | null;
}

export interface AppliedChatBeforeModelContinueResult {
  action: 'continue';
  modelConfig: ModelConfig;
  request: ChatBeforeModelRequest;
  buildToolSet: (input: {
    context: PluginCallContext;
    allowedToolNames?: string[];
  }) => ChatToolSet;
}

export interface AppliedChatBeforeModelShortCircuitResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

export type AppliedChatBeforeModelResult =
  | AppliedChatBeforeModelContinueResult
  | AppliedChatBeforeModelShortCircuitResult;

@Injectable()
export class PluginChatRuntimeFacade {
  private aiProviderPromise?: Promise<AiProviderService>;
  private skillSessionPromise?: Promise<SkillSessionService>;
  private toolRegistryPromise?: Promise<ToolRegistryService>;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async dispatchConversationCreated(input: {
    userId: string;
    conversation: {
      id: string;
      title: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }): Promise<void> {
    const hookContext = {
      source: 'http-route' as const,
      userId: input.userId,
      conversationId: input.conversation.id,
    };

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'conversation:created',
      context: hookContext,
      payload: {
        context: hookContext,
        conversation: {
          id: input.conversation.id,
          title: input.conversation.title,
          createdAt: input.conversation.createdAt.toISOString(),
          updatedAt: input.conversation.updatedAt.toISOString(),
        },
      },
    });
  }

  async applyMessageReceived(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    modelConfig: {
      providerId: string;
      id: string;
    };
    message: {
      role: 'user';
      content: string | null;
      parts: ChatMessagePart[];
    };
    modelMessages: PluginLlmMessage[];
    skillCommandResult?: {
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      providerId: string;
      modelId: string;
    } | null;
  }): Promise<MessageReceivedExecutionResult> {
    const hookContext = createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: input.modelConfig,
    });
    const payload = createMessageReceivedHookPayload({
      context: hookContext,
      conversationId: input.conversationId,
      providerId: input.modelConfig.providerId,
      modelId: input.modelConfig.id,
      message: input.message,
      modelMessages: input.modelMessages,
    });

    if (input.skillCommandResult) {
      return {
        action: 'short-circuit',
        payload,
        ...input.skillCommandResult,
      };
    }

    return this.pluginRuntime.runHook({
      hookName: 'message:received',
      context: hookContext,
      payload,
    }) as Promise<MessageReceivedExecutionResult>;
  }

  async applyMessageCreated(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    message: PluginChatMessageInput;
    modelMessages?: PluginLlmMessage[];
  }): Promise<MessageCreatedHookPayload> {
    return this.pluginRuntime.runHook({
      hookName: 'message:created',
      context: input.hookContext,
      payload: createMessageCreatedHookPayload({
        context: input.hookContext,
        conversationId: input.conversationId,
        message: input.message,
        modelMessages: input.modelMessages ?? [{
          role: input.message.role as PluginLlmMessage['role'],
          content: input.message.parts,
        }],
      }),
    }) as Promise<MessageCreatedHookPayload>;
  }

  async applyMessageUpdated(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    messageId: string;
    currentMessage: {
      id: string;
      role: string;
      content: string | null;
      partsJson?: string | null;
      provider?: string | null;
      model?: string | null;
      status?: string | null;
    };
    nextMessage: PluginChatMessageInput;
  }) {
    return this.pluginRuntime.runHook({
      hookName: 'message:updated',
      context: input.hookContext,
      payload: {
        context: input.hookContext,
        conversationId: input.conversationId,
        messageId: input.messageId,
        currentMessage: createPluginMessageHookInfoFromRecord(input.currentMessage),
        nextMessage: createPluginMessageHookInfo(input.nextMessage),
      },
    });
  }

  async dispatchMessageDeleted(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    messageId: string;
    message: {
      id: string;
      role: string;
      content: string | null;
      partsJson?: string | null;
      provider?: string | null;
      model?: string | null;
      status?: string | null;
    };
  }): Promise<void> {
    await this.pluginRuntime.runBroadcastHook({
      hookName: 'message:deleted',
      context: input.hookContext,
      payload: {
        context: input.hookContext,
        conversationId: input.conversationId,
        messageId: input.messageId,
        message: createPluginMessageHookInfoFromRecord(input.message),
      },
    });
  }

  async applyChatBeforeModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: import('../chat/chat-message-session').ChatRuntimeMessage[];
  }): Promise<AppliedChatBeforeModelResult> {
    const [skillSession, toolRegistry] = await Promise.all([
      this.getSkillSession(),
      this.getToolRegistry(),
    ]);
    const skillContext = await skillSession.getConversationSkillContext(
      input.conversationId,
    );
    const hookContext = createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: input.modelConfig,
    });
    const toolSelection = await toolRegistry.prepareToolSelection({
      context: createChatModelLifecycleContext({
        source: 'chat-tool',
        userId: input.userId,
        conversationId: input.conversationId,
        activePersonaId: input.activePersonaId,
        modelConfig: input.modelConfig,
      }),
    });
    const availableTools = filterChatAvailableTools(
      toolSelection.availableTools,
      skillContext.allowedToolNames,
      skillContext.deniedToolNames,
    );
    const hookResult = await this.pluginRuntime.runHook({
      hookName: 'chat:before-model',
      context: hookContext,
      payload: {
        context: hookContext,
        request: {
          providerId: input.modelConfig.providerId,
          modelId: input.modelConfig.id,
          systemPrompt: mergeChatSystemPrompts(
            input.systemPrompt,
            skillContext.systemPrompt,
          ),
          messages: input.messages,
          availableTools,
        },
      },
    }) as ChatBeforeModelExecutionResult;

    if (hookResult.action === 'short-circuit') {
      const normalizedAssistant = normalizeAssistantMessageOutput({
        content: hookResult.assistantContent,
        parts: hookResult.assistantParts,
      });

      return {
        action: 'short-circuit',
        request: hookResult.request,
        assistantContent: normalizedAssistant.content,
        assistantParts: normalizedAssistant.parts,
        providerId: hookResult.providerId,
        modelId: hookResult.modelId,
        ...(hookResult.reason ? { reason: hookResult.reason } : {}),
      };
    }

    return {
      action: 'continue',
      request: hookResult.request,
      modelConfig: (await this.getAiProvider()).getModelConfig(
        hookResult.request.providerId,
        hookResult.request.modelId,
      ),
      buildToolSet: ({ context, allowedToolNames }) => {
        const availableToolNames = availableTools.map((tool) => tool.name);

        return toolSelection.buildToolSet({
          context,
          allowedToolNames:
            filterAuthorAllowedToolNames(allowedToolNames, availableToolNames)
            ?? availableToolNames,
        });
      },
    };
  }

  async dispatchChatWaitingModel(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
  }): Promise<void> {
    const hookContext = createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: {
        providerId: input.activeProviderId,
        id: input.activeModelId,
      },
    });

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'chat:waiting-model',
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId: input.conversationId,
        assistantMessageId: input.assistantMessageId,
        providerId: input.activeProviderId,
        modelId: input.activeModelId,
        request: input.request,
      },
    });
  }

  async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const afterModelResult = await this.applyChatAfterModelHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      result: input.result,
    });

    return this.applyResponseBeforeSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: input.responseSource,
      result: afterModelResult,
    });
  }

  async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    const hookContext = this.createResultHookContext(input);

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'response:after-send',
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        ...this.createAssistantHookPayload(input.result),
        sentAt: new Date().toISOString(),
      },
    });
  }

  private async applyChatAfterModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const currentParts = input.result.parts ?? [];
    const patchedPayload = await this.pluginRuntime.runHook({
      hookName: 'chat:after-model',
      context: this.createResultHookContext(input),
      payload: this.createAssistantHookPayload(input.result),
    }) as {
      providerId: string;
      modelId: string;
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      toolCalls: CompletedChatTaskResult['toolCalls'];
      toolResults: CompletedChatTaskResult['toolResults'];
    };

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    if (
      normalizedAssistant.content === input.result.content
      && JSON.stringify(normalizedAssistant.parts) === JSON.stringify(currentParts)
    ) {
      return input.result;
    }

    return {
      ...input.result,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
    };
  }

  private async applyResponseBeforeSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const hookContext = this.createResultHookContext(input);
    const patchedPayload = await this.pluginRuntime.runHook({
      hookName: 'response:before-send',
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        ...this.createAssistantHookPayload(input.result),
      },
    }) as {
      providerId: string;
      modelId: string;
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      toolCalls: CompletedChatTaskResult['toolCalls'];
      toolResults: CompletedChatTaskResult['toolResults'];
    };

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    return {
      ...input.result,
      providerId: patchedPayload.providerId,
      modelId: patchedPayload.modelId,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
      toolCalls: patchedPayload.toolCalls,
      toolResults: patchedPayload.toolResults,
    };
  }

  private createResultHookContext(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    result: CompletedChatTaskResult;
  }) {
    return createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: {
        providerId: input.result.providerId,
        id: input.result.modelId,
      },
    });
  }

  private createAssistantHookPayload(result: CompletedChatTaskResult) {
    return {
      assistantMessageId: result.assistantMessageId,
      providerId: result.providerId,
      modelId: result.modelId,
      assistantContent: result.content,
      assistantParts: result.parts ?? [],
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
    };
  }

  private async getAiProvider(): Promise<AiProviderService> {
    if (this.aiProviderPromise) {
      return this.aiProviderPromise;
    }

    this.aiProviderPromise = (async () => {
      const { AiProviderService } = await import('../ai');
      const resolved = this.moduleRef.get<AiProviderService>(AiProviderService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('AiProviderService is not available');
      }

      return resolved;
    })();

    return this.aiProviderPromise;
  }

  private async getSkillSession(): Promise<SkillSessionService> {
    if (this.skillSessionPromise) {
      return this.skillSessionPromise;
    }

    this.skillSessionPromise = (async () => {
      const { SkillSessionService } = await import('../skill/skill-session.service');
      const resolved = this.moduleRef.get<SkillSessionService>(SkillSessionService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('SkillSessionService is not available');
      }

      return resolved;
    })();

    return this.skillSessionPromise;
  }

  private async getToolRegistry(): Promise<ToolRegistryService> {
    if (this.toolRegistryPromise) {
      return this.toolRegistryPromise;
    }

    this.toolRegistryPromise = (async () => {
      const { ToolRegistryService } = await import('../tool/tool-registry.service');
      const resolved = this.moduleRef.get<ToolRegistryService>(ToolRegistryService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('ToolRegistryService is not available');
      }

      return resolved;
    })();

    return this.toolRegistryPromise;
  }
}
