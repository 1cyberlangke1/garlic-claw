import { readContextCompactionConfig, resolveContextCompactionRuntimeConfig } from '@garlic-claw/plugin-sdk/authoring';
import type { ChatMessageMetadata, ChatMessagePart, ConversationContextWindowPreview, JsonValue, PluginCallContext, PluginConversationHistoryMessage, PluginConversationHistoryPreviewResult, PluginScopeSettings } from '@garlic-claw/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiManagementService } from '../ai-management/ai-management.service';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { ToolRegistryService } from '../execution/tool/tool-registry.service';
import { PersonaService } from '../persona/persona.service';
import { PluginPersistenceService } from '../plugin/persistence/plugin-persistence.service';
import { applyMutatingDispatchableHooks, isPluginEnabledForContext, listDispatchableHookPluginIds, runDispatchableHookChain, type DispatchableHookChainResult } from '../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimeHostConversationRecordService } from '../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../runtime/host/runtime-host-plugin-dispatch.service';
import { asJsonObject, asJsonValue, DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/runtime-host-values';
import { AiVisionService } from '../vision/ai-vision.service';
import type { CompletedConversationTaskResult, ResolvedConversationTaskStreamSource } from './conversation-task.service';

type ModelMessage = { content: string | ChatMessagePart[]; role: 'assistant' | 'system' | 'user' };
type ConversationHookInput = { activePersonaId?: string; conversationId?: string; modelId?: string; providerId?: string; userId?: string };
type ResolvedPersonaPlan = { beginDialogs: Array<{ content: string; role: 'assistant' | 'user' }>; customErrorMessage: string | null; personaId: string; prompt: string; toolNames: string[] | null };
type BeforeModelState = { action: 'continue'; activePersonaId?: string; conversationId: string; messages: ModelMessage[]; modelId: string; providerId: string; systemPrompt: string; userId?: string };
type BeforeModelResult = BeforeModelState | { action: 'short-circuit'; assistantContent: string; assistantParts: ChatMessagePart[]; modelId: string; providerId: string };
type ContextWindowEntry = { candidate: boolean; hidden: boolean; id: string; modelMessage: PluginConversationHistoryMessage | null };
type ContextWindowCandidateMessage = ContextWindowEntry & { modelMessage: PluginConversationHistoryMessage };
type ContextWindowRuntimeConfig = ReturnType<typeof resolveContextCompactionRuntimeConfig>;
const CONTEXT_COMPACTION_PLUGIN_ID = 'builtin.context-compaction';

export type ConversationResponseSource = 'model' | 'short-circuit';
export type ConversationStreamPlan = ResolvedConversationTaskStreamSource & { responseSource: ConversationResponseSource; shortCircuitParts: ChatMessagePart[] | null };
export type MessageReceivedPlanningResult =
  | { action: 'continue'; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string }
  | { action: 'short-circuit'; assistantContent: string; assistantParts: ChatMessagePart[]; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string };

@Injectable()
export class ConversationMessagePlanningService {
  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly aiManagementService: AiManagementService,
    private readonly aiVisionService: AiVisionService,
    private readonly pluginPersistenceService: PluginPersistenceService,
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

  async getContextWindowPreview(input: { conversationId: string; modelId?: string; providerId?: string; userId?: string }): Promise<ConversationContextWindowPreview> {
    this.runtimeHostConversationRecordService.requireConversation(input.conversationId, input.userId);
    const history = readConversationHistorySnapshot(this.runtimeHostConversationRecordService.readConversationHistory(input.conversationId, input.userId)), runtimeConfig = this.readContextWindowRuntimeConfig(), featureEnabled = this.isContextWindowEnabledForConversation(input.conversationId) && runtimeConfig.enabled, target = this.readContextWindowTarget(input.providerId, input.modelId);
    const maxWindowTokens = Math.max(1, Math.floor((Math.max(target.contextLength - runtimeConfig.reservedTokens, 256) * (featureEnabled && runtimeConfig.strategy === 'sliding' ? runtimeConfig.slidingWindowUsagePercent : 100)) / 100));
    if (!featureEnabled) {
      const includedMessages = omitTrailingPendingAssistant(history.messages).filter(isConversationHistoryModelMessage), preview = this.previewHistoryMessages(input.conversationId, includedMessages, target.modelId, target.providerId, input.userId);
      return createContextWindowPreview(runtimeConfig, { enabled: false, estimatedTokens: preview.estimatedTokens, includedMessageIds: includedMessages.map((message) => message.id), maxWindowTokens, strategy: runtimeConfig.strategy });
    }
    if (runtimeConfig.strategy === 'sliding') return this.readSlidingContextWindowPreview(input.conversationId, history.messages, runtimeConfig, maxWindowTokens, target.modelId, target.providerId, input.userId);
    return this.readSummaryContextWindowPreview(input.conversationId, history.messages, runtimeConfig, maxWindowTokens, target.modelId, target.providerId, input.userId);
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
    if (beforeModel.action === 'short-circuit') return { modelId: beforeModel.modelId, providerId: beforeModel.providerId, responseSource: 'short-circuit', shortCircuitParts: beforeModel.assistantParts, stream: createShortCircuitStream(beforeModel.assistantContent) };
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
    const assistantResult = responseSource === 'short-circuit' ? { ...result, metadata: createDisplayMessageMetadata('result'), parts: shortCircuitParts ?? result.parts } : await this.applyAssistantMutation('chat:after-model', context, result);
    return this.applyAssistantMutation('response:before-send', context, assistantResult, responseSource);
  }

  async broadcastAfterSend(contextInput: { activePersonaId?: string; conversationId: string; userId?: string }, result: CompletedConversationTaskResult, responseSource: ConversationResponseSource): Promise<void> {
    const context = createConversationHookContext({ ...contextInput, modelId: result.modelId, providerId: result.providerId });
    const payload = asJsonValue({ assistantContent: result.content, assistantMessageId: result.assistantMessageId, assistantParts: result.parts, context, conversationId: result.conversationId, modelId: result.modelId, providerId: result.providerId, responseSource, sentAt: new Date().toISOString(), toolCalls: result.toolCalls, toolResults: result.toolResults });
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'response:after-send', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({ context, hookName: 'response:after-send', payload, pluginId });
    }
  }

  private async buildModelMessages(conversationId: string, messageId: string): Promise<ModelMessage[]> {
    return Promise.all(this.runtimeHostConversationRecordService.requireConversation(conversationId).messages.filter((message) => message.id !== messageId && (message.role === 'assistant' || message.role === 'user')).map(async (message) => ({ content: Array.isArray(message.parts) ? await this.aiVisionService.resolveMessageParts(conversationId, message.parts as unknown as ChatMessagePart[]) : typeof message.content === 'string' ? message.content : '', role: message.role === 'assistant' ? 'assistant' : 'user' })));
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

  private isContextWindowEnabledForConversation(conversationId: string): boolean {
    const plugin = this.pluginPersistenceService.findPlugin(CONTEXT_COMPACTION_PLUGIN_ID);
    if (!plugin?.connected) return false;
    const scope: PluginScopeSettings = {
      conversations: { ...(plugin.conversationScopes ?? {}) },
      defaultEnabled: plugin.defaultEnabled,
    };
    return isPluginEnabledForContext(scope, { conversationId });
  }

  private previewHistoryMessages(conversationId: string, messages: PluginConversationHistoryMessage[], modelId: string, providerId: string, userId?: string): PluginConversationHistoryPreviewResult {
    return this.runtimeHostConversationRecordService.previewConversationHistory(conversationId, asJsonObject({ messages: sanitizeContextWindowPreviewMessages(messages), modelId, providerId }), userId) as unknown as PluginConversationHistoryPreviewResult;
  }

  private readContextWindowRuntimeConfig(): ContextWindowRuntimeConfig {
    const plugin = this.pluginPersistenceService.findPlugin(CONTEXT_COMPACTION_PLUGIN_ID);
    return resolveContextCompactionRuntimeConfig(readContextCompactionConfig(plugin?.configValues ?? null));
  }

  private readContextWindowTarget(providerId?: string, modelId?: string): { contextLength: number; modelId: string; providerId: string } {
    const resolvedProviderId = providerId ?? this.aiManagementService.getDefaultProviderSelection().providerId ?? this.aiManagementService.listProviders()[0]?.id ?? null;
    if (!resolvedProviderId) throw new NotFoundException('当前没有可用的 AI provider');
    const provider = this.aiManagementService.getProvider(resolvedProviderId), resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0] ?? null;
    if (!resolvedModelId) throw new NotFoundException(`Provider "${resolvedProviderId}" 没有可用模型`);
    const model = this.aiManagementService.getProviderModel(resolvedProviderId, resolvedModelId);
    return { contextLength: model.contextLength, modelId: resolvedModelId, providerId: resolvedProviderId };
  }

  private readSlidingContextWindowPreview(
    conversationId: string,
    historyMessages: PluginConversationHistoryMessage[],
    runtimeConfig: ContextWindowRuntimeConfig,
    maxWindowTokens: number,
    modelId: string,
    providerId: string,
    userId?: string,
  ): ConversationContextWindowPreview {
    const candidates = readContextWindowCompactedHistory(historyMessages).filter((entry): entry is ContextWindowCandidateMessage => entry.modelMessage !== null);
    const keepRecentCount = Math.min(runtimeConfig.keepRecentMessages, candidates.length);
    const maxTrimStart = Math.max(0, candidates.length - keepRecentCount);
    let selected = candidates;
    let preview = this.previewHistoryMessages(conversationId, candidates.map((entry) => entry.modelMessage), modelId, providerId, userId);

    for (let trimStart = 0; trimStart <= maxTrimStart; trimStart += 1) {
      const nextSelected = candidates.slice(trimStart);
      const nextPreview = this.previewHistoryMessages(conversationId, nextSelected.map((entry) => entry.modelMessage), modelId, providerId, userId);
      if (nextPreview.estimatedTokens <= maxWindowTokens) { selected = nextSelected; preview = nextPreview; break; }
      if (trimStart === maxTrimStart) {
        selected = nextSelected;
        preview = nextPreview;
      }
    }

    const includedMessageIds = selected.map((entry) => entry.id);
    return createContextWindowPreview(runtimeConfig, {
      enabled: true,
      estimatedTokens: preview.estimatedTokens,
      excludedMessageIds: candidates.map((entry) => entry.id).filter((id) => !includedMessageIds.includes(id)),
      includedMessageIds,
      maxWindowTokens,
      strategy: 'sliding',
    });
  }

  private readSummaryContextWindowPreview(
    conversationId: string,
    historyMessages: PluginConversationHistoryMessage[],
    runtimeConfig: ContextWindowRuntimeConfig,
    maxWindowTokens: number,
    modelId: string,
    providerId: string,
    userId?: string,
  ): ConversationContextWindowPreview {
    const entries = readContextWindowCompactedHistory(historyMessages);
    const includedEntries = entries.filter((entry): entry is ContextWindowCandidateMessage => !entry.hidden && entry.modelMessage !== null), preview = this.previewHistoryMessages(conversationId, includedEntries.map((entry) => entry.modelMessage), modelId, providerId, userId), includedMessageIds = includedEntries.map((entry) => entry.id);
    return createContextWindowPreview(runtimeConfig, { enabled: true, estimatedTokens: preview.estimatedTokens, excludedMessageIds: entries.filter((entry) => entry.candidate).map((entry) => entry.id).filter((id) => !includedMessageIds.includes(id)), includedMessageIds, maxWindowTokens, strategy: runtimeConfig.strategy });
  }
}

function createContextWindowPreview(runtimeConfig: ContextWindowRuntimeConfig, input: Pick<ConversationContextWindowPreview, 'enabled' | 'estimatedTokens' | 'includedMessageIds' | 'maxWindowTokens' | 'strategy'> & { excludedMessageIds?: string[] }): ConversationContextWindowPreview { return { ...input, excludedMessageIds: input.excludedMessageIds ?? [], frontendMessageWindowSize: runtimeConfig.frontendMessageWindowSize, keepRecentMessages: runtimeConfig.keepRecentMessages, slidingWindowUsagePercent: runtimeConfig.slidingWindowUsagePercent }; }

export function createShortCircuitStream(content: string) { const normalized = content.trim(); return { finishReason: 'short-circuit', fullStream: (async function* () { if (normalized) yield { text: normalized, type: 'text-delta' as const }; })() }; }

function createConversationHookContext(input: ConversationHookInput): PluginCallContext { return { ...(input.modelId ? { activeModelId: input.modelId } : {}), ...(input.providerId ? { activeProviderId: input.providerId } : {}), ...(input.conversationId ? { conversationId: input.conversationId } : {}), ...(input.userId ? { userId: input.userId } : {}), ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}), source: 'http-route' }; }

function toUserModelMessage(input: { content: string; parts: ChatMessagePart[] }): ModelMessage { return input.parts.length > 0 ? { content: input.parts, role: 'user' } : { content: input.content, role: 'user' }; }

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
  return { ...payload, ...(typeof mutation.assistantContent === 'string' ? { content: mutation.assistantContent } : {}), ...(Array.isArray(mutation.assistantParts) ? { parts: mutation.assistantParts as ChatMessagePart[] } : {}), ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}), ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}), ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls as CompletedConversationTaskResult['toolCalls'] } : {}), ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults as CompletedConversationTaskResult['toolResults'] } : {}) };
}

function createAssistantMutationPayload(hookName: 'chat:after-model' | 'response:before-send', payload: CompletedConversationTaskResult, context: PluginCallContext, responseSource?: ConversationResponseSource): Record<string, unknown> {
  return { assistantContent: payload.content, assistantMessageId: payload.assistantMessageId, assistantParts: payload.parts, ...(hookName === 'response:before-send' ? { context } : { conversationId: payload.conversationId }), modelId: payload.modelId, providerId: payload.providerId, ...(responseSource ? { responseSource } : {}), toolCalls: payload.toolCalls, toolResults: payload.toolResults };
}

function createDisplayMessageMetadata(variant: 'command' | 'result'): ChatMessageMetadata {
  return { annotations: [{ data: { variant }, owner: 'conversation.display-message', type: 'display-message', version: '1' }] };
}

function readStringMutation(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }

function readChatMessageParts(value: unknown): ChatMessagePart[] { return Array.isArray(value) ? value as ChatMessagePart[] : []; }

function readConversationHistorySnapshot(value: unknown): { messages: PluginConversationHistoryMessage[]; revision: string } { const record = value as { messages?: PluginConversationHistoryMessage[]; revision?: string } | null; return { messages: Array.isArray(record?.messages) ? record.messages : [], revision: typeof record?.revision === 'string' ? record.revision : '' }; }

function readContextWindowCompactedHistory(messages: PluginConversationHistoryMessage[]): ContextWindowEntry[] {
  const entries = messages.map((message) => ({ candidate: isContextWindowCandidateMessage(message), coveredCompactionIds: readCoveredCompactionIds(message), id: message.id, modelMessage: toContextWindowModelMessage(message), summaryCompactionId: readSummaryCompactionId(message) }));
  const activeSummaryIds = new Set(entries.flatMap((entry) => entry.summaryCompactionId ? [entry.summaryCompactionId] : []));
  const visibleIds = new Set(omitTrailingPendingAssistant(messages.filter((_, index) => !entries[index].coveredCompactionIds.some((compactionId) => activeSummaryIds.has(compactionId)))).map((message) => message.id));
  return entries.map(({ candidate, id, modelMessage, coveredCompactionIds }) => ({ candidate, hidden: coveredCompactionIds.some((compactionId) => activeSummaryIds.has(compactionId)) || !visibleIds.has(id), id, modelMessage: visibleIds.has(id) ? modelMessage : null }));
}

function isContextWindowCandidateMessage(message: PluginConversationHistoryMessage): boolean { return isConversationHistoryModelMessage(message) || readSummaryCompactionId(message) !== null; }

function isConversationHistoryModelMessage(message: PluginConversationHistoryMessage): boolean { return message.role === 'assistant' || message.role === 'system' || message.role === 'user'; }

function toContextWindowModelMessage(message: PluginConversationHistoryMessage): PluginConversationHistoryMessage | null {
  return isConversationHistoryModelMessage(message) ? message : readSummaryCompactionId(message) ? { ...message, role: 'assistant' } : null;
}

function omitTrailingPendingAssistant<T extends { role: string; status?: string }>(messages: T[]): T[] { const lastMessage = messages.at(-1); return lastMessage && lastMessage.role === 'assistant' && lastMessage.status === 'pending' ? messages.slice(0, -1) : messages; }

function sanitizeContextWindowPreviewMessages(messages: PluginConversationHistoryMessage[]): PluginConversationHistoryMessage[] { return messages.map((message, index) => sanitizeContextWindowPreviewMessage(message, index)); }

function sanitizeContextWindowPreviewMessage(message: PluginConversationHistoryMessage, index: number): PluginConversationHistoryMessage {
  const createdAt = typeof message.createdAt === 'string' && message.createdAt.trim().length > 0 ? message.createdAt : new Date(0).toISOString();
  const updatedAt = typeof message.updatedAt === 'string' && message.updatedAt.trim().length > 0 ? message.updatedAt : createdAt;
  const metadata = sanitizeContextWindowPreviewMetadata(message.metadata);
  const toolCalls = sanitizeContextWindowPreviewJsonArray(message.toolCalls);
  const toolResults = sanitizeContextWindowPreviewJsonArray(message.toolResults);
  return {
    content: typeof message.content === 'string' ? message.content : null,
    createdAt,
    ...(typeof message.error === 'string' ? { error: message.error } : {}),
    id: typeof message.id === 'string' && message.id.trim().length > 0 ? message.id : `context-window-preview-${index}`,
    ...(metadata ? { metadata } : {}),
    ...(typeof message.model === 'string' ? { model: message.model } : {}),
    parts: sanitizeContextWindowPreviewParts(message.parts),
    ...(typeof message.provider === 'string' ? { provider: message.provider } : {}),
    role: typeof message.role === 'string' ? message.role : 'assistant',
    status: readContextWindowPreviewStatus(message.status),
    ...(toolCalls ? { toolCalls } : {}),
    ...(toolResults ? { toolResults } : {}),
    updatedAt,
  };
}

function sanitizeContextWindowPreviewMetadata(value: unknown): ChatMessageMetadata | null {
  const normalized = sanitizeContextWindowPreviewJsonValue(value);
  return isRecord(normalized) ? normalized as ChatMessageMetadata : null;
}

function sanitizeContextWindowPreviewParts(parts: unknown): ChatMessagePart[] {
  return Array.isArray(parts) ? parts.flatMap<ChatMessagePart>((part) => {
    if (!isRecord(part) || typeof part.type !== 'string') return [];
    if (part.type === 'text' && typeof part.text === 'string') return [{ text: part.text, type: 'text' as const }];
    return part.type === 'image' && typeof part.image === 'string' ? [{ image: part.image, ...(typeof part.mimeType === 'string' ? { mimeType: part.mimeType } : {}), type: 'image' as const }] : [];
  }) : [];
}

function sanitizeContextWindowPreviewJsonArray(value: unknown): JsonValue[] | null {
  if (!Array.isArray(value)) return null;
  const sanitized = value.flatMap((entry) => { const normalized = sanitizeContextWindowPreviewJsonValue(entry); return normalized === null ? [] : [normalized]; });
  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeContextWindowPreviewJsonValue(value: unknown): JsonValue | null {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? JSON.parse(encoded) as JsonValue : null;
  } catch {
    return null;
  }
}

function readContextWindowPreviewStatus(value: unknown): PluginConversationHistoryMessage['status'] {
  return value === 'pending' || value === 'streaming' || value === 'completed' || value === 'stopped' || value === 'error' ? value : 'completed';
}

function readSummaryCompactionId(message: PluginConversationHistoryMessage): string | null {
  const match = readContextCompactionAnnotationData(message).find((data) => data.role === 'summary' && typeof data.compactionId === 'string');
  return typeof match?.compactionId === 'string' ? match.compactionId : null;
}

function readCoveredCompactionIds(message: PluginConversationHistoryMessage): string[] {
  return readContextCompactionAnnotationData(message).flatMap((data) => data.role === 'covered' && typeof data.compactionId === 'string' ? [data.compactionId] : []);
}

function readContextCompactionAnnotationData(message: PluginConversationHistoryMessage): Array<Record<string, unknown>> {
  return (message.metadata?.annotations ?? []).flatMap((annotation) => annotation.type === 'context-compaction' && annotation.owner === 'builtin.context-compaction' && isRecord(annotation.data) ? [annotation.data] : []);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
