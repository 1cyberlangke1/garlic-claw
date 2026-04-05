import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createStepLimit } from '../ai';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import type { CompletedChatTaskResult } from './chat-task.service';
import type {
  AppliedChatBeforeModelResult,
  ChatToolSet,
} from '../plugin/plugin-chat-runtime.facade';
import type {
  ChatBeforeModelRequest,
  PluginResponseSource,
} from '@garlic-claw/shared';

@Injectable()
export class ChatMessageOrchestrationService {
  private pluginChatRuntimePromise?: Promise<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade>;

  constructor(
    private readonly modelInvocation: ChatModelInvocationService,
    private readonly moduleRef: ModuleRef,
  ) {}

  buildStreamFactory(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    preparedInvocation: PreparedChatModelInvocation;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
    tools: ChatToolSet;
  }) {
    return (abortSignal: AbortSignal) => {
      void this.getPluginChatRuntime().then((pluginChatRuntime) =>
        pluginChatRuntime.dispatchChatWaitingModel({
          assistantMessageId: input.assistantMessageId,
          userId: input.userId,
          conversationId: input.conversationId,
          request: input.request,
          activeProviderId: input.activeProviderId,
          activeModelId: input.activeModelId,
          activePersonaId: input.activePersonaId,
        }));

      const streamed = this.modelInvocation.streamPrepared({
        prepared: input.preparedInvocation,
        system: input.request.systemPrompt,
        tools: input.tools,
        variant: input.request.variant,
        providerOptions: input.request.providerOptions,
        headers: input.request.headers,
        maxOutputTokens: input.request.maxOutputTokens,
        stopWhen: createStepLimit(5),
        abortSignal,
      });

      return {
        providerId: String(streamed.modelConfig.providerId),
        modelId: String(streamed.modelConfig.id),
        stream: streamed.result,
      };
    };
  }

  async applyChatBeforeModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: import('./chat-message-session').ChatRuntimeMessage[];
  }): Promise<AppliedChatBeforeModelResult> {
    return (await this.getPluginChatRuntime()).applyChatBeforeModelHooks(input);
  }

  async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    return (await this.getPluginChatRuntime()).applyFinalResponseHooks(input);
  }

  async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    await (await this.getPluginChatRuntime()).runResponseAfterSendHooks(input);
  }

  private async getPluginChatRuntime(): Promise<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade> {
    if (this.pluginChatRuntimePromise) {
      return this.pluginChatRuntimePromise;
    }

    this.pluginChatRuntimePromise = (async () => {
      const { PluginChatRuntimeFacade } = await import('../plugin/plugin-chat-runtime.facade');
      const resolved = this.moduleRef.get<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade>(
        PluginChatRuntimeFacade,
        {
          strict: false,
        },
      );
      if (!resolved) {
        throw new NotFoundException('PluginChatRuntimeFacade is not available');
      }

      return resolved;
    })();

    return this.pluginChatRuntimePromise;
  }
}
