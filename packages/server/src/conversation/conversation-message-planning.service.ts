import type { ChatMessageMetadata, ChatMessagePart, PluginCallContext } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { ToolRegistryService } from '../execution/tool/tool-registry.service';
import { PersonaService } from '../persona/persona.service';
import { applyMutatingDispatchableHooks, listDispatchableHookPluginIds, runDispatchableHookChain } from '../runtime/kernel/runtime-plugin-hook-governance';
import type { DispatchableHookChainResult } from '../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimeHostConversationRecordService } from '../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../runtime/host/runtime-host-plugin-dispatch.service';
import { asJsonValue, DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/runtime-host-values';
import { AiVisionService } from '../vision/ai-vision.service';
import type { CompletedConversationTaskResult, ResolvedConversationTaskStreamSource } from './conversation-task.service';

type ModelMessage = { content: string | ChatMessagePart[]; role: 'assistant' | 'user' };
type ConversationHookInput = { activePersonaId?: string; conversationId?: string; modelId?: string; providerId?: string; userId?: string };
type ResolvedPersonaPlan = { beginDialogs: Array<{ content: string; role: 'assistant' | 'user' }>; customErrorMessage: string | null; personaId: string; prompt: string; toolNames: string[] | null };
type BeforeModelState = { action: 'continue'; activePersonaId?: string; conversationId: string; messages: ModelMessage[]; modelId: string; providerId: string; systemPrompt: string; userId?: string };
type BeforeModelResult = BeforeModelState | { action: 'short-circuit'; assistantContent: string; assistantParts: ChatMessagePart[]; modelId: string; providerId: string };

export type ConversationResponseSource = 'model' | 'short-circuit';
export type ConversationStreamPlan = ResolvedConversationTaskStreamSource & { responseSource: ConversationResponseSource; shortCircuitParts: ChatMessagePart[] | null };
export type MessageReceivedPlanningResult =
  | { action: 'continue'; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string }
  | { action: 'short-circuit'; assistantContent: string; assistantParts: ChatMessagePart[]; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string };

@Injectable()
export class ConversationMessagePlanningService {
  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly aiVisionService: AiVisionService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    private readonly personaService: PersonaService,
    private readonly toolRegistryService: ToolRegistryService,
    @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
  ) {}

  async applyMessageReceived(input: { activePersonaId?: string; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string }): Promise<MessageReceivedPlanningResult> {
    const result = await runDispatchableHookChain<typeof input, Record<string, unknown>, MessageReceivedPlanningResult>({
      applyResponse: readMessageReceivedHookResponse,
      hookName: 'message:received',
      initialState: input,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload, context) => asJsonValue({
        context,
        conversationId: payload.conversationId,
        message: { content: payload.content, parts: payload.parts, role: 'user' },
        modelId: payload.modelId,
        modelMessages: [toUserModelMessage(payload)],
        providerId: payload.providerId,
      }),
      readContext: createConversationHookContext,
    });
    return 'shortCircuitResult' in result ? result.shortCircuitResult : { action: 'continue', ...result.state };
  }

  async createStreamPlan(input: { activePersonaId?: string; abortSignal: AbortSignal; conversationId: string; messageId: string; modelId: string; persona?: ResolvedPersonaPlan; providerId: string; userId?: string }): Promise<ConversationStreamPlan> {
    const persona = input.persona ?? this.personaService.readCurrentPersona({
      context: { activePersonaId: input.activePersonaId, conversationId: input.conversationId, source: 'http-route', ...(input.userId ? { userId: input.userId } : {}) },
      conversationId: input.conversationId,
    });
    await this.runConversationHistoryRewrite({ activePersonaId: persona.personaId, conversationId: input.conversationId, modelId: input.modelId, providerId: input.providerId, userId: input.userId });
    const beforeModel = await this.applyBeforeModel({
      action: 'continue',
      activePersonaId: persona.personaId,
      conversationId: input.conversationId,
      messages: [...persona.beginDialogs, ...await this.buildModelMessages(input.conversationId, input.messageId)],
      modelId: input.modelId,
      providerId: input.providerId,
      systemPrompt: persona.prompt,
      userId: input.userId,
    });
    if (beforeModel.action === 'short-circuit') {
      return { modelId: beforeModel.modelId, providerId: beforeModel.providerId, responseSource: 'short-circuit', shortCircuitParts: beforeModel.assistantParts, stream: createShortCircuitStream(beforeModel.assistantContent) };
    }
    const context = createConversationHookContext({ activePersonaId: persona.personaId, conversationId: input.conversationId, modelId: beforeModel.modelId, providerId: beforeModel.providerId, userId: input.userId });
    const tools = await this.toolRegistryService.buildToolSet({ abortSignal: input.abortSignal, allowedToolNames: persona.toolNames ?? undefined, assistantMessageId: input.messageId, context });
    const stream = this.aiModelExecutionService.streamText({
      allowFallbackChatModels: true,
      abortSignal: input.abortSignal,
      ...(beforeModel.modelId !== DEFAULT_PROVIDER_MODEL_ID ? { modelId: beforeModel.modelId } : {}),
      messages: beforeModel.messages,
      ...(beforeModel.providerId !== DEFAULT_PROVIDER_ID ? { providerId: beforeModel.providerId } : {}),
      ...(beforeModel.systemPrompt ? { system: beforeModel.systemPrompt } : {}),
      ...(tools ? { tools } : {}),
    });
    return { modelId: stream.modelId, providerId: stream.providerId, responseSource: 'model', shortCircuitParts: null, stream: { finishReason: stream.finishReason, fullStream: stream.fullStream } };
  }

  async finalizeTaskResult(result: CompletedConversationTaskResult, responseSource: ConversationResponseSource, shortCircuitParts: ChatMessagePart[] | null): Promise<CompletedConversationTaskResult> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(result.conversationId);
    const context = { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId };
    const assistantResult = responseSource === 'short-circuit'
      ? { ...result, metadata: createDisplayMessageMetadata('result'), parts: shortCircuitParts ?? result.parts }
      : await this.applyAssistantMutation('chat:after-model', context, result);
    return this.applyAssistantMutation('response:before-send', context, assistantResult, responseSource);
  }

  async broadcastAfterSend(contextInput: { activePersonaId?: string; conversationId: string; userId?: string }, result: CompletedConversationTaskResult, responseSource: ConversationResponseSource): Promise<void> {
    const context = createConversationHookContext({ ...contextInput, modelId: result.modelId, providerId: result.providerId });
    const payload = asJsonValue({
      assistantContent: result.content,
      assistantMessageId: result.assistantMessageId,
      assistantParts: result.parts,
      context,
      conversationId: result.conversationId,
      modelId: result.modelId,
      providerId: result.providerId,
      responseSource,
      sentAt: new Date().toISOString(),
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
    });
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'response:after-send', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({ context, hookName: 'response:after-send', payload, pluginId });
    }
  }

  private async buildModelMessages(conversationId: string, messageId: string): Promise<ModelMessage[]> {
    return Promise.all(this.runtimeHostConversationRecordService.requireConversation(conversationId).messages.filter((message) => message.id !== messageId && (message.role === 'assistant' || message.role === 'user')).map(async (message) => ({
      content: Array.isArray(message.parts) ? await this.aiVisionService.resolveMessageParts(conversationId, message.parts as unknown as ChatMessagePart[]) : typeof message.content === 'string' ? message.content : '',
      role: message.role === 'assistant' ? 'assistant' : 'user',
    })));
  }

  private async runConversationHistoryRewrite(input: { activePersonaId?: string; conversationId: string; modelId: string; providerId: string; userId?: string }): Promise<void> {
    const context = createConversationHookContext(input);
    let history = this.runtimeHostConversationRecordService.readConversationHistory(input.conversationId, input.userId);
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:history-rewrite', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({
        context,
        hookName: 'conversation:history-rewrite',
        payload: asJsonValue({ context, conversationId: input.conversationId, history, trigger: 'prepare-model' }),
        pluginId,
      });
      history = this.runtimeHostConversationRecordService.readConversationHistory(input.conversationId, input.userId);
    }
  }

  private async applyBeforeModel(input: BeforeModelState): Promise<BeforeModelResult> {
    const context = createConversationHookContext(input);
    const availableTools = await this.toolRegistryService.listAvailableTools({ context });
    const result = await runDispatchableHookChain<BeforeModelState, Record<string, unknown>, BeforeModelResult>({
      applyResponse: readBeforeModelHookResponse,
      hookName: 'chat:before-model',
      initialState: input,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload) => asJsonValue({ context, request: { availableTools, messages: payload.messages, modelId: payload.modelId, providerId: payload.providerId, systemPrompt: payload.systemPrompt } }),
      readContext: () => context,
    });
    return 'shortCircuitResult' in result ? result.shortCircuitResult : result.state;
  }

  private async applyAssistantMutation(hookName: 'chat:after-model' | 'response:before-send', contextInput: { activePersonaId?: string; conversationId: string; userId?: string }, result: CompletedConversationTaskResult, responseSource?: ConversationResponseSource): Promise<CompletedConversationTaskResult> {
    const context = createConversationHookContext({ ...contextInput, modelId: result.modelId, providerId: result.providerId });
    return applyMutatingDispatchableHooks({
      applyMutation: applyAssistantResultMutation,
      hookName,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload, nextContext) => Promise.resolve(asJsonValue(createAssistantMutationPayload(hookName, payload, nextContext, responseSource))),
      payload: result,
      readContext: () => context,
    });
  }
}

export function createShortCircuitStream(content: string) {
  const normalized = content.trim();
  return { finishReason: 'short-circuit', fullStream: (async function* () { if (normalized) {yield { text: normalized, type: 'text-delta' as const };} })() };
}

function createConversationHookContext(input: ConversationHookInput): PluginCallContext {
  return {
    ...(input.modelId ? { activeModelId: input.modelId } : {}),
    ...(input.providerId ? { activeProviderId: input.providerId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
    source: 'http-route',
  };
}

function toUserModelMessage(input: { content: string; parts: ChatMessagePart[] }): ModelMessage {
  return input.parts.length > 0 ? { content: input.parts, role: 'user' } : { content: input.content, role: 'user' };
}

function readMessageReceivedHookResponse<TPayload extends { content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string }>(
  payload: TPayload,
  mutation: Record<string, unknown>,
): DispatchableHookChainResult<TPayload, MessageReceivedPlanningResult> {
  return mutation.action === 'short-circuit' && typeof mutation.assistantContent === 'string'
    ? { shortCircuitResult: { action: 'short-circuit', assistantContent: mutation.assistantContent, assistantParts: readChatMessageParts(mutation.assistantParts), content: readStringMutation(mutation.content, payload.content), conversationId: payload.conversationId, modelId: readStringMutation(mutation.modelId, payload.modelId), parts: Array.isArray(mutation.parts) ? mutation.parts as ChatMessagePart[] : payload.parts, providerId: readStringMutation(mutation.providerId, payload.providerId), ...(payload.userId ? { userId: payload.userId } : {}) } }
    : { state: { ...payload, content: readStringMutation(mutation.content, payload.content), modelId: readStringMutation(mutation.modelId, payload.modelId), parts: Array.isArray(mutation.parts) ? mutation.parts as ChatMessagePart[] : payload.parts, providerId: readStringMutation(mutation.providerId, payload.providerId) } };
}

function readBeforeModelHookResponse(payload: BeforeModelState, mutation: Record<string, unknown>): DispatchableHookChainResult<BeforeModelState, BeforeModelResult> {
  return mutation.action === 'short-circuit' && typeof mutation.assistantContent === 'string'
    ? { shortCircuitResult: { action: 'short-circuit', assistantContent: mutation.assistantContent, assistantParts: readChatMessageParts(mutation.assistantParts), modelId: readStringMutation(mutation.modelId, payload.modelId), providerId: readStringMutation(mutation.providerId, payload.providerId) } }
    : { state: { ...payload, messages: Array.isArray(mutation.messages) ? mutation.messages as ModelMessage[] : payload.messages, modelId: readStringMutation(mutation.modelId, payload.modelId), providerId: readStringMutation(mutation.providerId, payload.providerId), ...(typeof mutation.systemPrompt === 'string' ? { systemPrompt: mutation.systemPrompt } : {}) } };
}

function applyAssistantResultMutation(payload: CompletedConversationTaskResult, mutation: Record<string, unknown>): CompletedConversationTaskResult {
  return {
    ...payload,
    ...(typeof mutation.assistantContent === 'string' ? { content: mutation.assistantContent } : {}),
    ...(Array.isArray(mutation.assistantParts) ? { parts: mutation.assistantParts as ChatMessagePart[] } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls as CompletedConversationTaskResult['toolCalls'] } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults as CompletedConversationTaskResult['toolResults'] } : {}),
  };
}

function createAssistantMutationPayload(hookName: 'chat:after-model' | 'response:before-send', payload: CompletedConversationTaskResult, context: PluginCallContext, responseSource?: ConversationResponseSource): Record<string, unknown> {
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
  return { annotations: [{ data: { variant }, owner: 'conversation.display-message', type: 'display-message', version: '1' }] };
}

function readStringMutation(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readChatMessageParts(value: unknown): ChatMessagePart[] {
  return Array.isArray(value) ? value as ChatMessagePart[] : [];
}
