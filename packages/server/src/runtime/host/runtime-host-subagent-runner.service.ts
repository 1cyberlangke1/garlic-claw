import type { JsonObject, JsonValue, PluginCallContext, PluginLlmMessage, PluginMessageTargetInfo, PluginSubagentDetail, PluginSubagentExecutionResult, PluginSubagentOverview, PluginSubagentRequest, PluginSubagentSummary, SubagentAfterRunHookResult, SubagentBeforeRunHookResult } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { ProjectSubagentTypeRegistryService } from '../../execution/project/project-subagent-type-registry.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../kernel/runtime-plugin-hook-governance';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readAssistantStreamPart, readJsonObject, readJsonStringRecord, readOptionalString, readPluginLlmMessages, readPositiveInteger } from './runtime-host-values';
import { RuntimeHostSubagentSessionStoreService, type RuntimeSubagentSessionRecord } from './runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService, type RuntimeSubagentRecord } from './runtime-host-subagent-store.service';

type ResolvedSubagentType = ReturnType<ProjectSubagentTypeRegistryService['getType']>;
type RuntimeSubagentRequestEnvelopeSource = Partial<Pick<PluginSubagentRequest, 'description' | 'subagentType' | 'providerId' | 'modelId' | 'system' | 'toolNames' | 'variant' | 'providerOptions' | 'headers' | 'maxOutputTokens'>>;
interface ResolvedSubagentInvocation { request: PluginSubagentRequest; requestPreview: string; resolvedSubagentType: ResolvedSubagentType; session: RuntimeSubagentSessionRecord; }
interface StoredSubagentExecutionInput { context: PluginCallContext; pluginId: string; request: PluginSubagentRequest; sessionId: string; subagentId: string; writeBackConversationRevision?: string; writeBackTarget: PluginMessageTargetInfo | null; }
interface SubagentSessionWriteInput { context: PluginCallContext; messages: PluginLlmMessage[]; pluginDisplayName?: string; pluginId: string; request: RuntimeSubagentRequestEnvelopeSource; resolvedSubagentTypeName?: string; session?: RuntimeSubagentSessionRecord | null; subagentId?: string; }
interface SubagentWriteBackResult { error: string | null; messageId: string | null; status: 'failed' | 'sent' | 'skipped'; }

@Injectable()
export class RuntimeHostSubagentRunnerService {
  private readonly scheduledSubagentIds = new Set<string>();

  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
    @Inject(forwardRef(() => ToolRegistryService)) private readonly toolRegistryService: ToolRegistryService,
    @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    private readonly runtimeHostSubagentStoreService: RuntimeHostSubagentStoreService,
    private readonly runtimeHostSubagentSessionStoreService: RuntimeHostSubagentSessionStoreService,
    private readonly projectSubagentTypeRegistryService: ProjectSubagentTypeRegistryService,
  ) {}

  resumePendingSubagents(pluginId?: string): void { for (const subagent of this.runtimeHostSubagentStoreService.listPendingSubagents(pluginId)) { this.scheduleSubagentExecution(subagent.id); } }
  getSubagent(pluginId: string, sessionId: string): PluginSubagentDetail { return this.runtimeHostSubagentStoreService.getSubagent(pluginId, sessionId); }
  getSubagentOrThrow(sessionId: string): PluginSubagentDetail { return this.runtimeHostSubagentStoreService.getSubagentOrThrow(sessionId); }
  listOverview(): PluginSubagentOverview { return this.runtimeHostSubagentStoreService.listOverview(); }
  listSubagents(pluginId: string): PluginSubagentSummary[] { return this.runtimeHostSubagentStoreService.listSubagents(pluginId); }
  listTypes() { return this.projectSubagentTypeRegistryService.listTypes(); }

  async removeSubagentSession(sessionId: string): Promise<boolean> {
    const subagent = this.runtimeHostSubagentStoreService.getSubagentOrThrow(sessionId), sessionRemoved = this.runtimeHostSubagentSessionStoreService.removeSession(subagent.pluginId, sessionId), removed = this.runtimeHostSubagentStoreService.removeSession(sessionId, subagent.pluginId) || sessionRemoved;
    if (removed) { await this.writeBackRemovedSubagentMessage(subagent); }
    return removed;
  }

  async runSubagent(pluginId: string, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const completed = await this.executeStoredSubagent(this.createStoredSubagent({ context, params, pluginId, visibility: 'inline', writeBackTarget: null }).execution);
    return asJsonValue({ ...completed.result, sessionId: completed.session.id, sessionMessageCount: completed.session.messages.length });
  }

  async startSubagent(pluginId: string, pluginDisplayName: string | undefined, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const writeBackTarget = readSubagentWriteBackTarget(params);
    const started = this.createStoredSubagent({
      context,
      conversationRevision: writeBackTarget?.id ? this.runtimeHostConversationMessageService.readConversationRevision(writeBackTarget.id) ?? undefined : undefined,
      params,
      pluginDisplayName,
      pluginId,
      visibility: 'background',
      writeBackTarget,
    });
    this.scheduleSubagentExecution(started.subagent.id);
    return asJsonValue(this.runtimeHostSubagentStoreService.summarizeSubagent(started.subagent));
  }

  private createStoredSubagent(input: {
    context: PluginCallContext;
    conversationRevision?: string;
    params: JsonObject;
    pluginDisplayName?: string;
    pluginId: string;
    visibility: 'background' | 'inline';
    writeBackTarget: PluginMessageTargetInfo | null;
  }): { execution: StoredSubagentExecutionInput; subagent: RuntimeSubagentRecord } {
    this.assertConversationSubagentCapacity(input.context, input.params);
    const invocation = this.resolveSubagentInvocation(input.pluginId, input.pluginDisplayName, input.context, input.params);
    const subagent = this.runtimeHostSubagentStoreService.createSubagent({
      ...(input.conversationRevision ? { conversationRevision: input.conversationRevision } : {}),
      context: input.context,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      ...(invocation.resolvedSubagentType?.id ? { subagentType: invocation.resolvedSubagentType.id } : {}),
      ...(invocation.resolvedSubagentType?.name ? { subagentTypeName: invocation.resolvedSubagentType.name } : {}),
      request: invocation.request,
      requestPreview: invocation.requestPreview,
      sessionId: invocation.session.id,
      sessionMessageCount: invocation.session.messages.length,
      sessionUpdatedAt: invocation.session.updatedAt,
      visibility: input.visibility,
      writeBackTarget: input.writeBackTarget,
    });
    return { execution: readStoredSubagentExecutionInput(subagent, invocation.session), subagent };
  }

  private assertConversationSubagentCapacity(context: PluginCallContext, params: JsonObject): void {
    const maxConversationSubagents = readPositiveInteger(params, 'maxConversationSubagents');
    if (!context.conversationId || !maxConversationSubagents || readOptionalString(params, 'sessionId')) { return; }
    const sessionCount = this.runtimeHostSubagentSessionStoreService.countConversationSessions(context.conversationId);
    if (sessionCount >= maxConversationSubagents) { throw new BadRequestException(`当前会话最多允许 ${maxConversationSubagents} 个 subagent 会话，已达到上限`); }
  }

  private restoreStoredSubagentExecution(subagentId: string): StoredSubagentExecutionInput {
    const subagent = this.runtimeHostSubagentStoreService.readSubagent(subagentId), session = this.runtimeHostSubagentSessionStoreService.readStoredSession(subagent.pluginId, subagent.sessionId);
    if (subagent.sessionId !== session.id || subagent.sessionMessageCount !== session.messages.length || subagent.sessionUpdatedAt !== session.updatedAt) {
      this.runtimeHostSubagentStoreService.updateSubagent(subagent.pluginId, subagentId, (currentSubagent) => { writeSubagentSessionSnapshot(currentSubagent, session); });
    }
    return readStoredSubagentExecutionInput(subagent, session);
  }

  private scheduleSubagentExecution(subagentId: string): void {
    if (this.scheduledSubagentIds.has(subagentId)) { return; }
    this.scheduledSubagentIds.add(subagentId);
    setTimeout(() => {
      this.scheduledSubagentIds.delete(subagentId);
      void this.executeStoredSubagent(this.restoreStoredSubagentExecution(subagentId)).catch(() => undefined);
    }, 0);
  }

  private async executeStoredSubagent(input: StoredSubagentExecutionInput): Promise<{ result: PluginSubagentExecutionResult; session: RuntimeSubagentSessionRecord }> {
    this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => writeStoredSubagentExecutionState(subagent, now, { status: 'running' }));
    const target = this.runtimeHostSubagentStoreService.readSubagent(input.subagentId, input.pluginId).removedAt ? null : input.writeBackTarget;
    try {
      const result = await this.executeSubagent({ context: input.context, pluginId: input.pluginId, request: input.request });
      const session = this.runtimeHostSubagentSessionStoreService.appendAssistantMessage(input.pluginId, input.sessionId, result);
      const writeBack = await this.writeBackMessageIfNeeded(input.context, target, input.writeBackConversationRevision, { content: result.text, failureMessage: '后台子代理结果回写失败', model: result.modelId, provider: result.providerId });
      this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => writeStoredSubagentExecutionState(subagent, now, { result, session, status: 'completed', writeBack }));
      return { result, session };
    } catch (error) {
      const message = error instanceof Error ? error.message : '后台子代理执行失败';
      const writeBack = await this.writeBackMessageIfNeeded(input.context, target, input.writeBackConversationRevision, { content: `子代理执行失败：${message}`, failureMessage: '后台子代理错误回写失败' });
      this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => writeStoredSubagentExecutionState(subagent, now, { error: message, status: 'error', writeBack }));
      throw error;
    }
  }

  private async writeBackRemovedSubagentMessage(subagent: PluginSubagentDetail): Promise<void> {
    const conversationId = subagent.conversationId ?? subagent.context.conversationId;
    if (!conversationId) { return; }
    try {
      await this.runtimeHostConversationMessageService.sendMessage(subagent.context, { content: readRemovedSubagentMessage(subagent), target: { id: conversationId, type: 'conversation' } });
    } catch {
      // 手动移除不应因回写提示失败而回滚删除语义。
    }
  }

  private resolveSubagentInvocation(pluginId: string, pluginDisplayName: string | undefined, context: PluginCallContext, params: JsonObject): ResolvedSubagentInvocation {
    const sessionId = readOptionalString(params, 'sessionId') ?? undefined, session = sessionId ? this.runtimeHostSubagentSessionStoreService.getSession(pluginId, sessionId) : null, nextRequest = readSubagentRequest(params, { allowMissingMessages: Boolean(session) }), request = session ? mergeSubagentRequests(session, nextRequest) : nextRequest, resolved = this.resolveEffectiveSubagentRequest(request);
    return {
      request,
      requestPreview: readSubagentRequestPreview(nextRequest),
      resolvedSubagentType: resolved.subagentType,
      session: this.persistSubagentSession({ context, messages: session ? request.messages : nextRequest.messages, pluginDisplayName, pluginId, request: resolved.request, resolvedSubagentTypeName: resolved.subagentType?.name, session }),
    };
  }

  private persistSubagentSession(input: SubagentSessionWriteInput): RuntimeSubagentSessionRecord {
    const requestEnvelope = copySubagentRequestEnvelope(input.request);
    if (!input.session) {
      return this.runtimeHostSubagentSessionStoreService.createSession({
        context: input.context,
        ...requestEnvelope,
        messages: input.messages,
        pluginDisplayName: input.pluginDisplayName,
        pluginId: input.pluginId,
        ...(input.resolvedSubagentTypeName ? { subagentTypeName: input.resolvedSubagentTypeName } : {}),
        ...(input.subagentId ? { subagentId: input.subagentId } : {}),
      });
    }
    return this.runtimeHostSubagentSessionStoreService.updateSession(input.pluginId, input.session.id, (mutableSession) => {
      mutableSession.messages = cloneJsonValue(input.messages);
      delete mutableSession.description; delete mutableSession.subagentType; delete mutableSession.subagentTypeName;
      Object.assign(mutableSession, requestEnvelope, input.resolvedSubagentTypeName ? { subagentTypeName: input.resolvedSubagentTypeName } : {});
    });
  }

  private async writeBackMessageIfNeeded(context: PluginCallContext, target: PluginMessageTargetInfo | null, conversationRevision: string | undefined, payload: { content: string; failureMessage: string; model?: string; provider?: string }): Promise<SubagentWriteBackResult> {
    if (!target) { return { error: null, messageId: null, status: 'skipped' }; }
    try {
      if (conversationRevision && this.runtimeHostConversationMessageService.readConversationRevision(target.id) !== conversationRevision) { throw new Error(`Conversation revision changed: ${target.id}`); }
      const sent = await this.runtimeHostConversationMessageService.sendMessage(context, {
        content: payload.content,
        ...(payload.model ? { model: payload.model } : {}),
        ...(payload.provider ? { provider: payload.provider } : {}),
        target: { id: target.id, type: target.type },
      });
      const messageId = readJsonObject(sent)?.id;
      return { error: null, messageId: typeof messageId === 'string' ? messageId : null, status: 'sent' };
    } catch (error) {
      return { error: error instanceof Error ? error.message : payload.failureMessage, messageId: null, status: 'failed' };
    }
  }

  private async executeSubagent(input: { context: PluginCallContext; pluginId: string; request: PluginSubagentRequest }): Promise<PluginSubagentExecutionResult> {
    const beforeHooks = await runDispatchableHookChain<PluginSubagentRequest, SubagentBeforeRunHookResult, PluginSubagentExecutionResult>({
      applyResponse: (request, response) => readSubagentBeforeRunResponse(request, response),
      hookName: 'subagent:before-run',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (request) => asJsonValue({ context: input.context, pluginId: input.pluginId, request }) as JsonObject,
      initialState: cloneJsonValue(input.request) as PluginSubagentRequest,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
    if ('shortCircuitResult' in beforeHooks) { return beforeHooks.shortCircuitResult; }
    const request = beforeHooks.state;
    const stream = this.aiModelExecutionService.streamText({
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      tools: await this.toolRegistryService.buildToolSet({ allowedToolNames: request.toolNames, context: input.context, excludedPluginId: input.pluginId }),
      variant: request.variant,
    });
    return applyMutatingDispatchableHooks({
      applyMutation: (nextResult, response) => applySubagentAfterRunMutation(nextResult, response as unknown as Extract<SubagentAfterRunHookResult, { action: 'mutate' }>),
      hookName: 'subagent:after-run',
      kernel: this.runtimeHostPluginDispatchService,
      payload: await collectSubagentRunResult({ finishReason: stream.finishReason, fullStream: stream.fullStream, modelId: stream.modelId, providerId: stream.providerId }),
      mapPayload: (nextResult) => asJsonValue({ context: input.context, pluginId: input.pluginId, request, result: nextResult }) as JsonObject,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
  }

  private resolveEffectiveSubagentRequest(request: PluginSubagentRequest): { subagentType: ResolvedSubagentType; request: PluginSubagentRequest } {
    const nextRequest = cloneJsonValue(request) as PluginSubagentRequest;
    if (!request.subagentType) { return { subagentType: null, request: nextRequest }; }
    const subagentType = this.projectSubagentTypeRegistryService.getType(request.subagentType);
    if (!subagentType) { throw new BadRequestException(`Unknown subagent type: ${request.subagentType}`); }
    return {
      subagentType,
      request: {
        ...nextRequest,
        ...(subagentType.providerId && !request.providerId ? { providerId: subagentType.providerId } : {}),
        ...(subagentType.modelId && !request.modelId ? { modelId: subagentType.modelId } : {}),
        ...(subagentType.system && !request.system ? { system: subagentType.system } : {}),
        ...(subagentType.toolNames && !request.toolNames ? { toolNames: cloneJsonValue(subagentType.toolNames) as string[] } : {}),
      },
    };
  }
}

function readSubagentRequest(params: JsonObject, options?: { allowMissingMessages?: boolean }): PluginSubagentRequest {
  const providerOptions = readJsonObject(params.providerOptions), headers = readJsonStringRecord(params.headers, 'subagent headers must be string record'), hasMessages = Object.prototype.hasOwnProperty.call(params, 'messages');
  return {
    ...(typeof params.description === 'string' && params.description.trim() ? { description: params.description.trim() } : {}),
    ...(typeof params.subagentType === 'string' && params.subagentType.trim() ? { subagentType: params.subagentType.trim() } : {}),
    ...(typeof params.providerId === 'string' ? { providerId: params.providerId } : {}),
    ...(typeof params.modelId === 'string' ? { modelId: params.modelId } : {}),
    ...(typeof params.system === 'string' ? { system: params.system } : {}),
    ...(Array.isArray(params.toolNames) ? { toolNames: params.toolNames.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) } : {}),
    ...(typeof params.variant === 'string' ? { variant: params.variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof params.maxOutputTokens === 'number' ? { maxOutputTokens: params.maxOutputTokens } : {}),
    messages: hasMessages || !options?.allowMissingMessages ? readPluginLlmMessages(params.messages, 'subagent request requires non-empty messages') : [],
  };
}

function readSubagentWriteBackTarget(params: JsonObject): PluginMessageTargetInfo | null {
  const target = readJsonObject(readJsonObject(params.writeBack)?.target);
  if (!target) { return null; }
  if (target.type !== 'conversation' || typeof target.id !== 'string') { throw new BadRequestException('subagent writeBack.target is invalid'); }
  return { id: target.id, ...(typeof target.label === 'string' ? { label: target.label } : {}), type: 'conversation' };
}

function readSubagentRequestPreview(request: PluginSubagentRequest): string {
  const content = request.messages.at(-1)?.content;
  if (typeof content === 'string' && content.trim()) { return content.trim(); }
  if (Array.isArray(content)) {
    const text = content.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text').map((part) => part.text.trim()).filter(Boolean).join('\n').trim();
    if (text) { return text; }
  }
  return request.description ?? 'structured subagent request';
}

function applySubagentAfterRunMutation(nextResult: PluginSubagentExecutionResult, mutation: Extract<SubagentAfterRunHookResult, { action: 'mutate' }>): PluginSubagentExecutionResult {
  const text = typeof mutation.text === 'string' ? mutation.text : nextResult.text;
  return {
    ...(cloneJsonValue(nextResult) as PluginSubagentExecutionResult),
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...('finishReason' in mutation ? { finishReason: mutation.finishReason ?? undefined } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults } : {}),
    ...(typeof mutation.text === 'string' ? { message: { ...nextResult.message, content: text }, text } : {}),
  };
}

function readSubagentBeforeRunResponse(request: PluginSubagentRequest, response: SubagentBeforeRunHookResult): { shortCircuitResult: PluginSubagentExecutionResult } | { state: PluginSubagentRequest } {
  if (response.action === 'short-circuit') {
    return { shortCircuitResult: { ...(response.finishReason !== undefined ? { finishReason: response.finishReason } : {}), message: { content: response.text, role: 'assistant' }, modelId: response.modelId ?? request.modelId ?? 'unknown-model', providerId: response.providerId ?? request.providerId ?? 'unknown-provider', text: response.text, toolCalls: response.toolCalls ?? [], toolResults: response.toolResults ?? [] } };
  }
  if (response.action === 'pass') { return { state: cloneJsonValue(request) as PluginSubagentRequest }; }
  return {
    state: {
      ...(cloneJsonValue(request) as PluginSubagentRequest),
      ...(typeof response.providerId === 'string' ? { providerId: response.providerId } : {}),
      ...(typeof response.modelId === 'string' ? { modelId: response.modelId } : {}),
      ...('system' in response ? { system: response.system ?? undefined } : {}),
      ...(Array.isArray(response.messages) ? { messages: response.messages } : {}),
      ...('toolNames' in response ? { toolNames: response.toolNames ?? undefined } : {}),
      ...('variant' in response ? { variant: response.variant ?? undefined } : {}),
      ...('providerOptions' in response ? { providerOptions: response.providerOptions ?? undefined } : {}),
      ...('headers' in response ? { headers: response.headers ?? undefined } : {}),
      ...('maxOutputTokens' in response && typeof response.maxOutputTokens === 'number' ? { maxOutputTokens: response.maxOutputTokens } : {}),
    },
  };
}

async function collectSubagentRunResult(input: { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; modelId: string; providerId: string }): Promise<PluginSubagentExecutionResult> {
  let text = '';
  const toolCalls: PluginSubagentExecutionResult['toolCalls'] = [], toolResults: PluginSubagentExecutionResult['toolResults'] = [];
  for await (const rawPart of input.fullStream) {
    const part = readAssistantStreamPart(rawPart);
    if (!part) { continue; }
    if (part.type === 'text-delta') { text += part.text; continue; }
    const payload = { toolCallId: part.toolCallId, toolName: part.toolName };
    if (part.type === 'tool-call') {
      toolCalls.push({ ...payload, input: asJsonValue(part.input) });
    } else {
      toolResults.push({ ...payload, output: asJsonValue(part.output) });
    }
  }
  const finishReason = await input.finishReason;
  return { ...(finishReason !== undefined ? { finishReason: finishReason === null ? null : String(finishReason) } : {}), message: { content: text, role: 'assistant' }, modelId: input.modelId, providerId: input.providerId, text, toolCalls, toolResults };
}

function copySubagentRequestEnvelope(input: RuntimeSubagentRequestEnvelopeSource): Omit<PluginSubagentRequest, 'messages'> {
  return { ...(input.description ? { description: input.description } : {}), ...(input.subagentType ? { subagentType: input.subagentType } : {}), ...(input.providerId ? { providerId: input.providerId } : {}), ...(input.modelId ? { modelId: input.modelId } : {}), ...(input.system ? { system: input.system } : {}), ...(input.toolNames ? { toolNames: cloneJsonValue(input.toolNames) as string[] } : {}), ...(input.variant ? { variant: input.variant } : {}), ...(input.providerOptions ? { providerOptions: cloneJsonValue(input.providerOptions) as JsonObject } : {}), ...(input.headers ? { headers: cloneJsonValue(input.headers) as Record<string, string> } : {}), ...(typeof input.maxOutputTokens === 'number' ? { maxOutputTokens: input.maxOutputTokens } : {}) };
}

function mergeSubagentRequests(session: RuntimeSubagentSessionRecord, nextRequest: PluginSubagentRequest): PluginSubagentRequest {
  return { ...copySubagentRequestEnvelope(session), messages: [...(cloneJsonValue(session.messages) as PluginSubagentRequest['messages']), ...(cloneJsonValue(nextRequest.messages) as PluginSubagentRequest['messages'])], ...copySubagentRequestEnvelope(nextRequest) };
}

function writeSubagentSessionSnapshot(subagent: RuntimeSubagentRecord, session: RuntimeSubagentSessionRecord): void {
  subagent.sessionId = session.id; subagent.sessionMessageCount = session.messages.length; subagent.sessionUpdatedAt = session.updatedAt;
}

function readStoredSubagentExecutionInput(subagent: Pick<RuntimeSubagentRecord, 'context' | 'id' | 'pluginId' | 'writeBackConversationRevision' | 'writeBackTarget'>, session: RuntimeSubagentSessionRecord): StoredSubagentExecutionInput {
  return { context: subagent.context, pluginId: subagent.pluginId, request: { ...copySubagentRequestEnvelope(session), messages: cloneJsonValue(session.messages) as PluginSubagentRequest['messages'] }, sessionId: session.id, subagentId: subagent.id, ...(subagent.writeBackConversationRevision ? { writeBackConversationRevision: subagent.writeBackConversationRevision } : {}), writeBackTarget: subagent.writeBackTarget ?? null };
}

function readRemovedSubagentMessage(subagent: PluginSubagentDetail): string {
  const description = subagent.description?.trim();
  return description ? `子代理「${description}」已被手动移除，后续结果不会再回写到主会话。` : '子代理已被手动移除，后续结果不会再回写到主会话。';
}

function writeStoredSubagentExecutionState(subagent: RuntimeSubagentRecord, now: string, state: { status: 'running' } | { result: PluginSubagentExecutionResult; session: RuntimeSubagentSessionRecord; status: 'completed'; writeBack: SubagentWriteBackResult } | { error: string; status: 'error'; writeBack: SubagentWriteBackResult }): void {
  subagent.startedAt = subagent.startedAt ?? now;
  if (state.status === 'running') { subagent.status = 'running'; return; }
  subagent.finishedAt = now; subagent.writeBackError = state.writeBack.error ?? undefined; subagent.writeBackMessageId = state.writeBack.messageId ?? undefined; subagent.writeBackStatus = state.writeBack.status;
  if (state.status === 'completed') { subagent.status = 'completed'; subagent.error = undefined; subagent.result = state.result; subagent.resultPreview = state.result.text; writeSubagentSessionSnapshot(subagent, state.session); return; }
  subagent.status = 'error'; subagent.error = state.error; subagent.result = null; subagent.resultPreview = undefined;
}
