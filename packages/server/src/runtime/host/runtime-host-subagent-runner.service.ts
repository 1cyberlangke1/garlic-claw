import type {
  JsonObject,
  JsonValue,
  PluginCallContext,
  PluginLlmMessage,
  PluginMessageTargetInfo,
  PluginSubagentDetail,
  PluginSubagentExecutionResult,
  PluginSubagentOverview,
  PluginSubagentRequest,
  PluginSubagentSummary,
  SubagentAfterRunHookResult,
  SubagentBeforeRunHookResult,
} from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { ProjectSubagentTypeRegistryService } from '../../execution/project/project-subagent-type-registry.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../kernel/runtime-plugin-hook-governance';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import {
  asJsonValue,
  cloneJsonValue,
  readAssistantStreamPart,
  readJsonObject,
  readJsonStringRecord,
  readOptionalString,
  readPluginLlmMessages,
} from './runtime-host-values';
import { RuntimeHostSubagentSessionStoreService, type RuntimeSubagentSessionRecord } from './runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService, type RuntimeSubagentRecord } from './runtime-host-subagent-store.service';

interface ResolvedSubagentInvocation {
  request: PluginSubagentRequest;
  requestPreview: string;
  resolvedSubagentType: ReturnType<ProjectSubagentTypeRegistryService['getType']>;
  session: RuntimeSubagentSessionRecord;
}
interface StoredSubagentExecution { result: PluginSubagentExecutionResult; session: RuntimeSubagentSessionRecord; }
type RuntimeSubagentRequestEnvelopeSource = Partial<Pick<PluginSubagentRequest,
  'description' | 'subagentType' | 'providerId' | 'modelId' | 'system' | 'toolNames' | 'variant' | 'providerOptions' | 'headers' | 'maxOutputTokens'>>;

@Injectable()
export class RuntimeHostSubagentRunnerService {
  private readonly scheduledSubagentIds = new Set<string>();

  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
    private readonly toolRegistryService: ToolRegistryService,
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    private readonly runtimeHostSubagentStoreService: RuntimeHostSubagentStoreService,
    private readonly runtimeHostSubagentSessionStoreService: RuntimeHostSubagentSessionStoreService,
    private readonly projectSubagentTypeRegistryService: ProjectSubagentTypeRegistryService,
  ) {}

  resumePendingSubagents(pluginId?: string): void {
    for (const subagent of this.runtimeHostSubagentStoreService.listPendingSubagents(pluginId)) {
      this.scheduleSubagentExecution(subagent.id);
    }
  }

  getSubagent(pluginId: string, sessionId: string): PluginSubagentDetail { return this.runtimeHostSubagentStoreService.getSubagent(pluginId, sessionId); }
  getSubagentOrThrow(sessionId: string): PluginSubagentDetail { return this.runtimeHostSubagentStoreService.getSubagentOrThrow(sessionId); }
  listOverview(): PluginSubagentOverview { return this.runtimeHostSubagentStoreService.listOverview(); }
  listSubagents(pluginId: string): PluginSubagentSummary[] { return this.runtimeHostSubagentStoreService.listSubagents(pluginId); }

  async runSubagent(pluginId: string, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const invocation = this.resolveSubagentInvocation(pluginId, undefined, context, params);
    const subagent = this.createSubagentRecord({
      context,
      invocation,
      pluginDisplayName: undefined,
      pluginId,
      visibility: 'inline',
      writeBackTarget: null,
    });
    const completed = await this.executeStoredSubagent({
      context,
      pluginId,
      request: invocation.request,
      sessionId: invocation.session.id,
      subagentId: subagent.id,
      writeBackTarget: null,
    });
    return asJsonValue({
      ...completed.result,
      sessionId: completed.session.id,
      sessionMessageCount: completed.session.messages.length,
    });
  }

  async startSubagent(
    pluginId: string,
    pluginDisplayName: string | undefined,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const writeBackTarget = readSubagentWriteBackTarget(params);
    const invocation = this.resolveSubagentInvocation(pluginId, pluginDisplayName, context, params);
    const subagent = this.createSubagentRecord({
      context,
      conversationRevision: writeBackTarget?.id
        ? this.runtimeHostConversationMessageService.readConversationRevision(writeBackTarget.id) ?? undefined
        : undefined,
      invocation,
      pluginDisplayName,
      pluginId,
      visibility: 'background',
      writeBackTarget,
    });
    this.scheduleSubagentExecution(subagent.id);
    return asJsonValue(this.runtimeHostSubagentStoreService.summarizeSubagent(subagent));
  }

  private async completeSubagentAsync(subagentId: string): Promise<void> {
    const snapshot = this.runtimeHostSubagentStoreService.readSubagent(subagentId);
    const session = this.resolveSubagentSession({ context: snapshot.context, pluginDisplayName: snapshot.pluginDisplayName, pluginId: snapshot.pluginId, subagent: snapshot });
    try {
      this.syncSubagentSessionSnapshot(snapshot.pluginId, subagentId, snapshot, session);
      await this.executeStoredSubagent({ context: snapshot.context, pluginId: snapshot.pluginId, request: snapshot.request, sessionId: session.id, subagentId, writeBackConversationRevision: snapshot.writeBackConversationRevision, writeBackTarget: snapshot.writeBackTarget ?? null });
    } catch (error) {
      void error;
    }
  }

  private scheduleSubagentExecution(subagentId: string): void {
    if (this.scheduledSubagentIds.has(subagentId)) {
      return;
    }
    this.scheduledSubagentIds.add(subagentId);
    setTimeout(() => {
      this.scheduledSubagentIds.delete(subagentId);
      void this.completeSubagentAsync(subagentId);
    }, 0);
  }

  private createSubagentRecord(input: {
    context: PluginCallContext;
    conversationRevision?: string;
    invocation: ResolvedSubagentInvocation;
    pluginDisplayName: string | undefined;
    pluginId: string;
    visibility: 'background' | 'inline';
    writeBackTarget: PluginMessageTargetInfo | null;
  }): RuntimeSubagentRecord {
    return this.runtimeHostSubagentStoreService.createSubagent({
      ...(input.conversationRevision ? { conversationRevision: input.conversationRevision } : {}),
      context: input.context,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      ...(input.invocation.resolvedSubagentType?.id ? { subagentType: input.invocation.resolvedSubagentType.id } : {}),
      ...(input.invocation.resolvedSubagentType?.name ? { subagentTypeName: input.invocation.resolvedSubagentType.name } : {}),
      request: input.invocation.request,
      requestPreview: input.invocation.requestPreview,
      sessionId: input.invocation.session.id,
      sessionMessageCount: input.invocation.session.messages.length,
      sessionUpdatedAt: input.invocation.session.updatedAt,
      visibility: input.visibility, writeBackTarget: input.writeBackTarget,
    });
  }

  private syncSubagentSessionSnapshot(
    pluginId: string,
    subagentId: string,
    snapshot: RuntimeSubagentRecord,
    session: RuntimeSubagentSessionRecord,
  ): void {
    if (snapshot.sessionId === session.id && snapshot.sessionMessageCount === session.messages.length && snapshot.sessionUpdatedAt === session.updatedAt) {return;}
    this.runtimeHostSubagentStoreService.updateSubagent(pluginId, subagentId, (currentSubagent) => {
      writeSubagentSessionSnapshot(currentSubagent, session);
    });
  }

  private async executeStoredSubagent(input: {
    context: PluginCallContext;
    pluginId: string;
    request: PluginSubagentRequest;
    sessionId: string;
    subagentId: string;
    writeBackConversationRevision?: string;
    writeBackTarget: PluginMessageTargetInfo | null;
  }): Promise<StoredSubagentExecution> {
    this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => {
      subagent.startedAt = subagent.startedAt ?? now;
      subagent.status = 'running';
    });
    try {
      const result = await this.executeSubagent({ context: input.context, pluginId: input.pluginId, request: input.request });
      const session = this.runtimeHostSubagentSessionStoreService.appendAssistantMessage(input.pluginId, input.sessionId, result);
      const writeBack = await this.writeBackResultIfNeeded(input.context, result, input.writeBackTarget, input.writeBackConversationRevision);
      this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => {
        subagent.startedAt = subagent.startedAt ?? now;
        subagent.status = 'completed';
        subagent.finishedAt = now;
        subagent.error = undefined;
        subagent.result = result;
        subagent.resultPreview = result.text;
        subagent.writeBackError = writeBack.error ?? undefined;
        subagent.writeBackMessageId = writeBack.messageId ?? undefined;
        subagent.writeBackStatus = writeBack.status;
        writeSubagentSessionSnapshot(subagent, session);
      });
      return { result, session };
    } catch (error) {
      this.runtimeHostSubagentStoreService.updateSubagent(input.pluginId, input.subagentId, (subagent, now) => {
        subagent.startedAt = subagent.startedAt ?? now;
        subagent.status = 'error';
        subagent.error = error instanceof Error ? error.message : '后台子代理执行失败';
        subagent.finishedAt = now;
        subagent.result = null;
        subagent.resultPreview = undefined;
        subagent.writeBackError = undefined;
        subagent.writeBackMessageId = undefined;
        subagent.writeBackStatus = 'skipped';
      });
      throw error;
    }
  }

  private resolveSubagentInvocation(
    pluginId: string,
    pluginDisplayName: string | undefined,
    context: PluginCallContext,
    params: JsonObject,
  ): ResolvedSubagentInvocation {
    const resumeSessionId = readOptionalString(params, 'sessionId') ?? undefined;
    const nextRequest = readSubagentRequest(params, { allowMissingMessages: Boolean(resumeSessionId) });
    const currentSession = resumeSessionId
      ? this.runtimeHostSubagentSessionStoreService.getSession(pluginId, resumeSessionId)
      : null;
    const request = currentSession ? mergeSubagentRequests(currentSession, nextRequest) : nextRequest;
    const resolved = this.resolveEffectiveSubagentRequest(request);
    const session = currentSession
      ? this.runtimeHostSubagentSessionStoreService.updateSession(pluginId, currentSession.id, (mutableSession) => {
          mutableSession.messages = cloneJsonValue(request.messages);
          writeSubagentSessionRequest(mutableSession, resolved.request, resolved.subagentType?.name);
        })
      : this.runtimeHostSubagentSessionStoreService.createSession(createSubagentSessionPayload({
          context,
          messages: nextRequest.messages,
          pluginDisplayName,
          pluginId,
          request: resolved.request,
          resolvedSubagentTypeName: resolved.subagentType?.name,
        }));
    return {
      request,
      requestPreview: readSubagentRequestPreview(nextRequest) ?? nextRequest.description ?? 'structured subagent request',
      resolvedSubagentType: resolved.subagentType,
      session,
    };
  }

  private resolveSubagentSession(input: {
    context: PluginCallContext;
    pluginDisplayName: string | undefined;
    pluginId: string;
    subagent: RuntimeSubagentRecord;
  }): RuntimeSubagentSessionRecord {
    if (input.subagent.sessionId) {
      try {
        return this.runtimeHostSubagentSessionStoreService.getSession(input.pluginId, input.subagent.sessionId);
      } catch {
        // 兼容旧记录：若 session 文件尚不存在，则按历史请求即时重建。
      }
    }
    const historyMessages = [...input.subagent.request.messages, ...(input.subagent.result?.message?.content ? [{ content: input.subagent.result.message.content, role: 'assistant' as const }] : [])];
    return this.runtimeHostSubagentSessionStoreService.createSession(createSubagentSessionPayload({
      context: input.context,
      messages: historyMessages,
      pluginDisplayName: input.pluginDisplayName ?? input.subagent.pluginDisplayName,
      pluginId: input.pluginId,
      request: {
        ...input.subagent.request,
        description: input.subagent.description,
        modelId: input.subagent.modelId,
        providerId: input.subagent.providerId,
        subagentType: input.subagent.subagentType,
      },
      resolvedSubagentTypeName: input.subagent.subagentTypeName,
      subagentId: input.subagent.id,
    }));
  }

  private async writeBackResultIfNeeded(
    context: PluginCallContext,
    result: PluginSubagentExecutionResult,
    target: PluginMessageTargetInfo | null,
    conversationRevision?: string,
  ) {
    if (!target) {return { error: null, messageId: null, status: 'skipped' as const };}
    try {
      if (conversationRevision && this.runtimeHostConversationMessageService.readConversationRevision(target.id) !== conversationRevision) {throw new Error(`Conversation revision changed: ${target.id}`);}
      const sent = await this.runtimeHostConversationMessageService.sendMessage(context, {
        content: result.text,
        model: result.modelId,
        provider: result.providerId,
        target: { id: target.id, type: target.type },
      });
      const messageId = readJsonObject(sent)?.id;
      return { error: null, messageId: typeof messageId === 'string' ? messageId : null, status: 'sent' as const };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '后台子代理结果回写失败', messageId: null, status: 'failed' as const };
    }
  }

  private async executeSubagent(input: {
    context: PluginCallContext;
    pluginId: string;
    request: PluginSubagentRequest;
  }): Promise<PluginSubagentExecutionResult> {
    const resolvedRequest = this.resolveEffectiveSubagentRequest(input.request);
    const beforeHooks = await runDispatchableHookChain<
      PluginSubagentRequest,
      SubagentBeforeRunHookResult,
      PluginSubagentExecutionResult
    >({
      applyResponse: (request, response) => readSubagentBeforeRunResponse(request, response),
      hookName: 'subagent:before-run',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (request) => asJsonValue({
        context: input.context,
        pluginId: input.pluginId,
        request,
      }) as JsonObject,
      initialState: resolvedRequest.request,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
    if ('shortCircuitResult' in beforeHooks) {
      return beforeHooks.shortCircuitResult;
    }
    const request = beforeHooks.state;
    const tools = await this.toolRegistryService.buildToolSet({
      allowedToolNames: request.toolNames,
      context: input.context,
      excludedPluginId: input.pluginId,
    });
    const stream = this.aiModelExecutionService.streamText({
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      tools,
      variant: request.variant,
    });
    const result = await collectSubagentRunResult({
      finishReason: stream.finishReason,
      fullStream: stream.fullStream,
      modelId: stream.modelId,
      providerId: stream.providerId,
    });
    return applyMutatingDispatchableHooks({
      applyMutation: (nextResult, response) =>
        applySubagentAfterRunMutation(
          nextResult,
          response as unknown as Extract<SubagentAfterRunHookResult, { action: 'mutate' }>,
        ),
      hookName: 'subagent:after-run',
      kernel: this.runtimeHostPluginDispatchService,
      payload: result,
      mapPayload: (nextResult) => asJsonValue({
        context: input.context,
        pluginId: input.pluginId,
        request,
        result: nextResult,
      }) as JsonObject,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
  }

  listTypes() {
    return this.projectSubagentTypeRegistryService.listTypes();
  }

  private resolveEffectiveSubagentRequest(request: PluginSubagentRequest): {
    subagentType: ReturnType<ProjectSubagentTypeRegistryService['getType']>;
    request: PluginSubagentRequest;
  } {
    if (!request.subagentType) {
      return {
        subagentType: null,
        request: cloneJsonValue(request) as PluginSubagentRequest,
      };
    }
    const subagentType = this.projectSubagentTypeRegistryService.getType(request.subagentType);
    if (!subagentType) {
      throw new BadRequestException(`Unknown subagent type: ${request.subagentType}`);
    }
    return {
      subagentType,
      request: {
        ...(cloneJsonValue(request) as PluginSubagentRequest),
        ...(subagentType.providerId && !request.providerId ? { providerId: subagentType.providerId } : {}),
        ...(subagentType.modelId && !request.modelId ? { modelId: subagentType.modelId } : {}),
        ...(subagentType.system && !request.system ? { system: subagentType.system } : {}),
        ...(subagentType.toolNames && !request.toolNames
          ? { toolNames: cloneJsonValue(subagentType.toolNames) as string[] }
          : {}),
      },
    };
  }
}

function readSubagentRequest(params: JsonObject, options?: { allowMissingMessages?: boolean }): PluginSubagentRequest {
  const providerOptions = readJsonObject(params.providerOptions);
  const headers = readJsonStringRecord(params.headers, 'subagent headers must be string record');
  const hasMessages = Object.prototype.hasOwnProperty.call(params, 'messages');
  return {
    ...(typeof params.description === 'string' && params.description.trim() ? { description: params.description.trim() } : {}),
    ...(typeof params.subagentType === 'string' && params.subagentType.trim() ? { subagentType: params.subagentType.trim() } : {}),
    ...(typeof params.providerId === 'string' ? { providerId: params.providerId } : {}),
    ...(typeof params.modelId === 'string' ? { modelId: params.modelId } : {}),
    ...(typeof params.system === 'string' ? { system: params.system } : {}),
    ...(Array.isArray(params.toolNames) ? { toolNames: params.toolNames.filter(isNonEmptyString) } : {}),
    ...(typeof params.variant === 'string' ? { variant: params.variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof params.maxOutputTokens === 'number' ? { maxOutputTokens: params.maxOutputTokens } : {}),
    messages: hasMessages
      ? readPluginLlmMessages(params.messages, 'subagent request requires non-empty messages')
      : options?.allowMissingMessages
        ? []
        : readPluginLlmMessages(params.messages, 'subagent request requires non-empty messages'),
  };
}

function readSubagentWriteBackTarget(params: JsonObject): PluginMessageTargetInfo | null {
  const target = readJsonObject(readJsonObject(params.writeBack)?.target);
  if (!target) {return null;}
  if (target.type !== 'conversation' || typeof target.id !== 'string') {throw new BadRequestException('subagent writeBack.target is invalid');}
  return { id: target.id, ...(typeof target.label === 'string' ? { label: target.label } : {}), type: 'conversation' };
}

function readSubagentRequestPreview(request: Pick<PluginSubagentRequest, 'messages' | 'description'>): string | null {
  const lastContent = request.messages.at(-1)?.content;
  if (typeof lastContent === 'string') {return lastContent.trim() || null;}
  if (!Array.isArray(lastContent)) {return null;}
  return lastContent
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim() || null;
}

function applySubagentAfterRunMutation(
  nextResult: PluginSubagentExecutionResult,
  mutation: Extract<SubagentAfterRunHookResult, { action: 'mutate' }>,
): PluginSubagentExecutionResult {
  const text = typeof mutation.text === 'string' ? mutation.text : nextResult.text;
  return {
    ...cloneJsonValue(nextResult) as PluginSubagentExecutionResult,
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...('finishReason' in mutation ? { finishReason: mutation.finishReason ?? undefined } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults } : {}),
    ...(typeof mutation.text === 'string'
      ? {
          message: {
            ...nextResult.message,
            content: text,
          },
          text,
        }
      : {}),
  };
}

function readSubagentBeforeRunResponse(request: PluginSubagentRequest, response: SubagentBeforeRunHookResult) {
  if (response.action === 'short-circuit') {
    return {
      shortCircuitResult: {
        ...(response.finishReason !== undefined ? { finishReason: response.finishReason } : {}),
        message: {
          content: response.text,
          role: 'assistant' as const,
        },
        modelId: response.modelId ?? request.modelId ?? 'unknown-model',
        providerId: response.providerId ?? request.providerId ?? 'unknown-provider',
        text: response.text,
        toolCalls: response.toolCalls ?? [],
        toolResults: response.toolResults ?? [],
      },
    };
  }
  if (response.action === 'pass') {
    return { state: cloneJsonValue(request) as PluginSubagentRequest };
  }
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
      ...('maxOutputTokens' in response && typeof response.maxOutputTokens === 'number'
        ? { maxOutputTokens: response.maxOutputTokens }
        : {}),
    },
  };
}

async function collectSubagentRunResult(input: {
  finishReason?: Promise<unknown> | unknown;
  fullStream: AsyncIterable<unknown>;
  modelId: string;
  providerId: string;
}): Promise<PluginSubagentExecutionResult> {
  let text = '';
  const toolCalls: PluginSubagentExecutionResult['toolCalls'] = [];
  const toolResults: PluginSubagentExecutionResult['toolResults'] = [];
  for await (const rawPart of input.fullStream) {
    const part = readAssistantStreamPart(rawPart);
    if (!part) {
      continue;
    }
    if (part.type === 'text-delta') {
      text += part.text;
      continue;
    }
    if (part.type === 'tool-call') {
      toolCalls.push({
        input: asJsonValue(part.input),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
      });
      continue;
    }
    toolResults.push({
      output: asJsonValue(part.output),
      toolCallId: part.toolCallId,
      toolName: part.toolName,
    });
  }
  const finishReason = await input.finishReason;
  return {
    ...(finishReason !== undefined ? { finishReason: finishReason === null ? null : String(finishReason) } : {}),
    message: {
      content: text,
      role: 'assistant',
    },
    modelId: input.modelId,
    providerId: input.providerId,
    text,
    toolCalls,
    toolResults,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createSubagentSessionPayload(input: {
  context: PluginCallContext;
  messages: PluginLlmMessage[];
  pluginDisplayName?: string;
  pluginId: string;
  request: RuntimeSubagentRequestEnvelopeSource;
  resolvedSubagentTypeName?: string;
  subagentId?: string;
}): Parameters<RuntimeHostSubagentSessionStoreService['createSession']>[0] {
  return {
    context: input.context,
    ...copySubagentRequestEnvelope(input.request),
    messages: input.messages,
    pluginDisplayName: input.pluginDisplayName,
    pluginId: input.pluginId,
    ...(input.resolvedSubagentTypeName ? { subagentTypeName: input.resolvedSubagentTypeName } : {}),
    ...(input.subagentId ? { subagentId: input.subagentId } : {}),
  };
}

function copySubagentRequestEnvelope(input: RuntimeSubagentRequestEnvelopeSource): Omit<PluginSubagentRequest, 'messages'> {
  return {
    ...(input.description ? { description: input.description } : {}),
    ...(input.subagentType ? { subagentType: input.subagentType } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: cloneJsonValue(input.toolNames) as string[] } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: cloneJsonValue(input.providerOptions) as JsonObject } : {}),
    ...(input.headers ? { headers: cloneJsonValue(input.headers) as Record<string, string> } : {}),
    ...(typeof input.maxOutputTokens === 'number' ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };
}

function mergeSubagentRequests(
  session: RuntimeSubagentSessionRecord,
  nextRequest: PluginSubagentRequest,
): PluginSubagentRequest {
  return {
    ...copySubagentRequestEnvelope(session),
    messages: [
      ...cloneJsonValue(session.messages) as PluginSubagentRequest['messages'],
      ...cloneJsonValue(nextRequest.messages) as PluginSubagentRequest['messages'],
    ],
    ...copySubagentRequestEnvelope(nextRequest),
  };
}

function writeSubagentSessionRequest(
  session: RuntimeSubagentSessionRecord,
  request: RuntimeSubagentRequestEnvelopeSource,
  resolvedSubagentTypeName?: string,
): void {
  const nextRequest = copySubagentRequestEnvelope(request);
  delete session.description;
  delete session.subagentType;
  delete session.subagentTypeName;
  Object.assign(session, nextRequest, resolvedSubagentTypeName ? { subagentTypeName: resolvedSubagentTypeName } : {});
}

function writeSubagentSessionSnapshot(
  subagent: RuntimeSubagentRecord,
  session: RuntimeSubagentSessionRecord,
): void {
  subagent.sessionId = session.id;
  subagent.sessionMessageCount = session.messages.length;
  subagent.sessionUpdatedAt = session.updatedAt;
}
