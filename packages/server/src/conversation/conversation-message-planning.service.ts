import type { ChatMessageMetadata, ChatMessagePart, PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { ToolRegistryService } from '../execution/tool/tool-registry.service';
import { PersonaService } from '../persona/persona.service';
import { RuntimeHostConversationRecordService } from '../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../runtime/host/runtime-host-plugin-dispatch.service';
import { asJsonValue, DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/runtime-host-values';
import type { DispatchableHookChainResult } from '../runtime/kernel/runtime-plugin-hook-governance';
import { applyMutatingDispatchableHooks, listDispatchableHookPluginIds, runDispatchableHookChain } from '../runtime/kernel/runtime-plugin-hook-governance';
import { AiVisionService } from '../vision/ai-vision.service';
import type { CompletedConversationTaskResult, ResolvedConversationTaskStreamSource } from './conversation-task.service';

export type ConversationResponseSource = 'model' | 'short-circuit';
export type ConversationStreamPlan = ResolvedConversationTaskStreamSource & { responseSource: ConversationResponseSource; shortCircuitParts: ChatMessagePart[] | null };
export type MessageReceivedPlanningResult =
  | {
      action: 'continue';
      content: string;
      conversationId: string;
      modelId: string;
      parts: ChatMessagePart[];
      providerId: string;
      userId?: string;
    }
  | {
      action: 'short-circuit';
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      content: string;
      conversationId: string;
      modelId: string;
      parts: ChatMessagePart[];
      providerId: string;
      userId?: string;
    };

@Injectable()
export class ConversationMessagePlanningService {
  constructor(private readonly aiModelExecutionService: AiModelExecutionService, private readonly aiVisionService: AiVisionService, private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService, private readonly personaService: PersonaService, private readonly toolRegistryService: ToolRegistryService, @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService) {}

  async applyMessageReceived(input: { activePersonaId?: string; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string }): Promise<MessageReceivedPlanningResult> {
    const result = await runDispatchableHookChain<
      typeof input,
      Record<string, unknown>,
      MessageReceivedPlanningResult
    >({
      applyResponse: (payload, mutation) => readMessageReceivedHookResponse(payload, mutation),
      hookName: 'message:received',
      initialState: input,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload, context) => asJsonValue({
        context,
        conversationId: payload.conversationId,
        modelId: payload.modelId,
        providerId: payload.providerId,
        message: {
          content: payload.content,
          parts: payload.parts,
          role: 'user',
        },
        modelMessages: [
          payload.parts.length > 0
            ? { content: payload.parts, role: 'user' }
            : { content: payload.content, role: 'user' },
        ],
      }),
      readContext: (payload) => createConversationHookContext(payload),
    });
    return 'shortCircuitResult' in result
      ? result.shortCircuitResult
      : {
          action: 'continue',
          ...result.state,
        };
  }

  async createStreamPlan(input: { activePersonaId?: string; abortSignal: AbortSignal; conversationId: string; messageId: string; modelId: string; persona?: { beginDialogs: Array<{ content: string; role: 'assistant' | 'user' }>; customErrorMessage: string | null; personaId: string; prompt: string; toolNames: string[] | null }; providerId: string; userId?: string }): Promise<ConversationStreamPlan> {
    const persona = input.persona ?? this.personaService.readCurrentPersona({
      context: {
        activePersonaId: input.activePersonaId,
        conversationId: input.conversationId,
        source: 'http-route',
        ...(input.userId ? { userId: input.userId } : {}),
      },
      conversationId: input.conversationId,
    });
    await this.runConversationHistoryRewrite({
      activePersonaId: persona.personaId,
      conversationId: input.conversationId,
      modelId: input.modelId,
      providerId: input.providerId,
      userId: input.userId,
    });
    const beforeModel = await this.applyBeforeModel({
      activePersonaId: persona.personaId,
      conversationId: input.conversationId,
      messages: [...persona.beginDialogs, ...await this.buildModelMessages(input.conversationId, input.messageId)],
      modelId: input.modelId,
      providerId: input.providerId,
      systemPrompt: persona.prompt,
      userId: input.userId,
    });
    if (!beforeModel) {throw new BadRequestException('Invalid before-model hook result');}
    if (beforeModel.action === 'short-circuit') {return { modelId: beforeModel.modelId, providerId: beforeModel.providerId, responseSource: 'short-circuit', shortCircuitParts: beforeModel.assistantParts, stream: createShortCircuitStream(beforeModel.assistantContent) };}
    if (beforeModel.action !== 'continue') {throw new BadRequestException('Invalid before-model hook result');}
    const tools = await this.toolRegistryService.buildToolSet({ allowedToolNames: persona.toolNames ?? undefined, context: createConversationHookContext({ activePersonaId: persona.personaId, conversationId: input.conversationId, modelId: beforeModel.modelId, providerId: beforeModel.providerId, userId: input.userId }) });
    const modelId = beforeModel.modelId === DEFAULT_PROVIDER_MODEL_ID ? undefined : beforeModel.modelId;
    const providerId = beforeModel.providerId === DEFAULT_PROVIDER_ID ? undefined : beforeModel.providerId;
    const stream = this.aiModelExecutionService.streamText({
      allowFallbackChatModels: true,
      abortSignal: input.abortSignal,
      ...(modelId ? { modelId } : {}),
      messages: beforeModel.messages,
      ...(providerId ? { providerId } : {}),
      ...(beforeModel.systemPrompt
        ? { system: beforeModel.systemPrompt }
        : {}),
      ...(tools ? { tools } : {}),
    });
    return { modelId: stream.modelId, providerId: stream.providerId, responseSource: 'model', shortCircuitParts: null, stream: { finishReason: stream.finishReason, fullStream: stream.fullStream } };
  }

  async finalizeTaskResult(result: CompletedConversationTaskResult, responseSource: ConversationResponseSource, shortCircuitParts: ChatMessagePart[] | null): Promise<CompletedConversationTaskResult> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(result.conversationId);
    const assistantResult = responseSource === 'short-circuit'
      ? {
          ...result,
          metadata: createDisplayMessageMetadata('result'),
          parts: shortCircuitParts ?? result.parts,
        }
      : await this.applyAssistantMutation('chat:after-model', { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId }, result);
    return this.applyAssistantMutation('response:before-send', { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId }, assistantResult, responseSource);
  }

  async broadcastAfterSend(contextInput: { activePersonaId?: string; conversationId: string; userId?: string }, result: CompletedConversationTaskResult, responseSource: ConversationResponseSource): Promise<void> {
    const context = createConversationHookContext({ ...contextInput, modelId: result.modelId, providerId: result.providerId });
    const payload = { assistantContent: result.content, assistantMessageId: result.assistantMessageId, assistantParts: result.parts, context, conversationId: result.conversationId, modelId: result.modelId, providerId: result.providerId, responseSource, sentAt: new Date().toISOString(), toolCalls: result.toolCalls, toolResults: result.toolResults };
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'response:after-send', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({ context, hookName: 'response:after-send', payload: asJsonValue(payload), pluginId });
    }
  }

  private async buildModelMessages(conversationId: string, messageId: string): Promise<Array<{ content: string | ChatMessagePart[]; role: 'assistant' | 'user' }>> {
    return Promise.all(this.runtimeHostConversationRecordService.requireConversation(conversationId).messages.filter((entry) => entry.id !== messageId && (entry.role === 'assistant' || entry.role === 'user')).map(async (message) => ({ content: Array.isArray(message.parts) ? await this.aiVisionService.resolveMessageParts(conversationId, message.parts as unknown as ChatMessagePart[]) : typeof message.content === 'string' ? message.content : '', role: message.role === 'assistant' ? 'assistant' : 'user' })));
  }

  private async runConversationHistoryRewrite(input: { activePersonaId?: string; conversationId: string; modelId: string; providerId: string; userId?: string }): Promise<void> {
    const context = createConversationHookContext(input);
    let history = this.runtimeHostConversationRecordService.readConversationHistory(input.conversationId, input.userId);
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:history-rewrite', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({
        context,
        hookName: 'conversation:history-rewrite',
        payload: asJsonValue({
          context,
          conversationId: input.conversationId,
          history,
          trigger: 'prepare-model',
        }),
        pluginId,
      });
      history = this.runtimeHostConversationRecordService.readConversationHistory(input.conversationId, input.userId);
    }
  }

  private async applyBeforeModel(input: { activePersonaId?: string; conversationId: string; messages: Array<{ content: string | ChatMessagePart[]; role: 'assistant' | 'user' }>; modelId: string; providerId: string; systemPrompt: string; userId?: string }) {
    const context = createConversationHookContext(input);
    const availableTools = await this.toolRegistryService.listAvailableTools({ context });
    const result = await runDispatchableHookChain({
      applyResponse: (payload, mutation: Record<string, unknown>) => readBeforeModelHookResponse(payload, mutation),
      hookName: 'chat:before-model',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload) => asJsonValue({ context, request: { availableTools, messages: payload.messages, modelId: payload.modelId, providerId: payload.providerId, systemPrompt: payload.systemPrompt } }),
      initialState: { action: 'continue' as const, ...input },
      readContext: () => context,
    });
    return 'shortCircuitResult' in result ? result.shortCircuitResult : result.state;
  }

  private async applyAssistantMutation(hookName: 'chat:after-model' | 'response:before-send', contextInput: { activePersonaId?: string; conversationId: string; userId?: string }, result: CompletedConversationTaskResult, responseSource?: ConversationResponseSource): Promise<CompletedConversationTaskResult> {
    const context = createConversationHookContext({ ...contextInput, modelId: result.modelId, providerId: result.providerId });
    return this.applyConversationHooks(
      hookName,
      context,
      result,
      (payload, nextContext) => createAssistantMutationPayload(hookName, payload, nextContext, responseSource),
      applyAssistantResultMutation,
    );
  }

  private async applyConversationHooks<TPayload>(hookName: 'chat:after-model' | 'chat:before-model' | 'message:received' | 'response:before-send', context: PluginCallContext, payload: TPayload, mapPayload: (payload: TPayload, context: PluginCallContext) => Record<string, unknown> | Promise<Record<string, unknown>>, applyMutation: (payload: TPayload, mutation: Record<string, unknown>) => TPayload): Promise<TPayload> {
    return applyMutatingDispatchableHooks({
      applyMutation,
      hookName,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: async (nextPayload, nextContext) => asJsonValue(await mapPayload(nextPayload, nextContext)),
      payload,
      readContext: () => context,
    });
  }
}

export function createShortCircuitStream(content: string) {
  const normalized = content.trim();
  return {
    finishReason: 'short-circuit',
    fullStream: (async function* () { if (normalized) {yield { text: normalized, type: 'text-delta' as const };} })(),
  };
}

function createConversationHookContext(input: { activePersonaId?: string; conversationId?: string; modelId?: string; providerId?: string; userId?: string }): PluginCallContext {
  return { ...(input.modelId ? { activeModelId: input.modelId } : {}), ...(input.providerId ? { activeProviderId: input.providerId } : {}), ...(input.conversationId ? { conversationId: input.conversationId } : {}), ...(input.userId ? { userId: input.userId } : {}), ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}), source: 'http-route' };
}

function applyMessageMutation<TPayload extends { content: string; modelId: string; parts: ChatMessagePart[]; providerId: string }>(payload: TPayload, mutation: Record<string, unknown>): TPayload {
  return {
    ...payload,
    ...(typeof mutation.content === 'string' ? { content: mutation.content } : {}),
    ...(Array.isArray(mutation.parts) ? { parts: mutation.parts as unknown as ChatMessagePart[] } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
  };
}

function readMessageReceivedHookResponse<TPayload extends {
  content: string;
  conversationId: string;
  modelId: string;
  parts: ChatMessagePart[];
  providerId: string;
  userId?: string;
}>(
  payload: TPayload,
  mutation: Record<string, unknown>,
): DispatchableHookChainResult<TPayload, MessageReceivedPlanningResult> {
  if (mutation.action === 'short-circuit' && typeof mutation.assistantContent === 'string') {
    return {
      shortCircuitResult: {
        action: 'short-circuit',
        assistantContent: mutation.assistantContent,
        assistantParts: Array.isArray(mutation.assistantParts)
          ? mutation.assistantParts as ChatMessagePart[]
          : [],
        content: typeof mutation.content === 'string' ? mutation.content : payload.content,
        conversationId: payload.conversationId,
        modelId: typeof mutation.modelId === 'string' ? mutation.modelId : payload.modelId,
        parts: Array.isArray(mutation.parts) ? mutation.parts as ChatMessagePart[] : payload.parts,
        providerId: typeof mutation.providerId === 'string' ? mutation.providerId : payload.providerId,
        ...(payload.userId ? { userId: payload.userId } : {}),
      },
    };
  }

  return {
    state: applyMessageMutation(payload, mutation),
  };
}

function applyAssistantResultMutation(payload: CompletedConversationTaskResult, mutation: Record<string, unknown>): CompletedConversationTaskResult {
  return {
    ...payload,
    ...(typeof mutation.assistantContent === 'string' ? { content: mutation.assistantContent } : {}),
    ...(Array.isArray(mutation.assistantParts) ? { parts: mutation.assistantParts as unknown as ChatMessagePart[] } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls as CompletedConversationTaskResult['toolCalls'] } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults as CompletedConversationTaskResult['toolResults'] } : {}),
  };
}

function createAssistantMutationPayload(hookName: 'chat:after-model' | 'response:before-send', payload: CompletedConversationTaskResult, context: PluginCallContext, responseSource?: ConversationResponseSource) {
  return {
    assistantContent: payload.content,
    assistantMessageId: payload.assistantMessageId,
    assistantParts: payload.parts,
    ...(hookName === 'response:before-send' ? { context } : { conversationId: payload.conversationId }),
    modelId: payload.modelId,
    providerId: payload.providerId,
    ...(responseSource ? { responseSource } : {}),
    toolCalls: payload.toolCalls,
    toolResults: payload.toolResults,
  };
}

function createDisplayMessageMetadata(variant: 'command' | 'result'): ChatMessageMetadata {
  return {
    annotations: [
      {
        data: {
          variant,
        },
        owner: 'conversation.display-message',
        type: 'display-message',
        version: '1',
      },
    ],
  };
}

function readBeforeModelHookResponse<TPayload extends { messages: Array<{ content: string | ChatMessagePart[]; role: 'assistant' | 'user' }>; modelId: string; providerId: string; systemPrompt: string }>(payload: TPayload, mutation: Record<string, unknown>) {
  return mutation.action === 'short-circuit' && typeof mutation.assistantContent === 'string'
    ? {
        shortCircuitResult: {
          action: 'short-circuit' as const,
          assistantContent: mutation.assistantContent,
          assistantParts: Array.isArray(mutation.assistantParts) ? mutation.assistantParts as ChatMessagePart[] : [],
          modelId: typeof mutation.modelId === 'string' ? mutation.modelId : payload.modelId,
          providerId: typeof mutation.providerId === 'string' ? mutation.providerId : payload.providerId,
        },
      }
    : {
        state: {
          ...payload,
          ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
          ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
          ...(Array.isArray(mutation.messages) ? { messages: mutation.messages as typeof payload.messages } : {}),
          ...(typeof mutation.systemPrompt === 'string' ? { systemPrompt: mutation.systemPrompt } : {}),
        },
      };
}
