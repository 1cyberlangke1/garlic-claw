import type { JsonObject, JsonValue, PluginCallContext, PluginLlmMessage, PluginMessageTargetInfo, PluginSubagentRequest, PluginSubagentRunResult, PluginSubagentTaskDetail, PluginSubagentTaskOverview, PluginSubagentTaskSummary, SubagentAfterRunHookResult, SubagentBeforeRunHookResult } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../kernel/runtime-plugin-hook-governance';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostSubagentTypeRegistryService } from './runtime-host-subagent-type-registry.service';
import { asJsonValue, cloneJsonValue, readAssistantStreamPart, readJsonObject, readJsonStringRecord, readOptionalString, readPluginLlmMessages } from './runtime-host-values';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostSubagentTaskStoreService, type RuntimeSubagentTaskRecord } from './runtime-host-subagent-task-store.service';
import { RuntimeHostSubagentSessionStoreService, type RuntimeSubagentSessionRecord } from './runtime-host-subagent-session-store.service';

interface ResolvedSubagentInvocation {
  request: PluginSubagentRequest;
  requestPreview: string;
  session: RuntimeSubagentSessionRecord;
}

@Injectable()
export class RuntimeHostSubagentRunnerService {
  private readonly scheduledTaskIds = new Set<string>();

  constructor(private readonly aiModelExecutionService: AiModelExecutionService, private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService, private readonly toolRegistryService: ToolRegistryService, @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, private readonly runtimeHostSubagentTaskStoreService: RuntimeHostSubagentTaskStoreService, private readonly runtimeHostSubagentSessionStoreService: RuntimeHostSubagentSessionStoreService = new RuntimeHostSubagentSessionStoreService(), private readonly runtimeHostSubagentTypeRegistryService: RuntimeHostSubagentTypeRegistryService = new RuntimeHostSubagentTypeRegistryService()) {}

  resumePendingTasks(pluginId?: string): void {
    for (const task of this.runtimeHostSubagentTaskStoreService.listPendingTasks(pluginId)) {this.scheduleTaskExecution(task.id);}
  }

  getTask(pluginId: string, taskId: string): PluginSubagentTaskDetail { return this.runtimeHostSubagentTaskStoreService.getTask(pluginId, taskId); }

  getTaskOrThrow(taskId: string): PluginSubagentTaskDetail { return this.runtimeHostSubagentTaskStoreService.getTaskOrThrow(taskId); }

  listOverview(): PluginSubagentTaskOverview { return this.runtimeHostSubagentTaskStoreService.listOverview(); }

  listTasks(pluginId: string): PluginSubagentTaskSummary[] { return this.runtimeHostSubagentTaskStoreService.listTasks(pluginId); }

  async runSubagent(pluginId: string, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const invocation = this.resolveSubagentInvocation(pluginId, undefined, context, params);
    const resolvedRequest = this.resolveEffectiveSubagentRequest(invocation.request);
    const task = this.runtimeHostSubagentTaskStoreService.createTask({
      context,
      pluginDisplayName: undefined,
      pluginId,
      ...(resolvedRequest.subagentType?.id ? { subagentType: resolvedRequest.subagentType.id } : {}),
      ...(resolvedRequest.subagentType?.name ? { subagentTypeName: resolvedRequest.subagentType.name } : {}),
      request: invocation.request,
      requestPreview: invocation.requestPreview,
      sessionId: invocation.session.id,
      sessionMessageCount: invocation.session.messages.length,
      sessionUpdatedAt: invocation.session.updatedAt,
      visibility: 'inline',
      writeBackTarget: null,
    });
    this.runtimeHostSubagentTaskStoreService.updateTask(pluginId, task.id, markTaskRunning);
    try {
      const result = await this.executeSubagent({ context, pluginId, request: invocation.request });
      const session = this.runtimeHostSubagentSessionStoreService.appendAssistantMessage(pluginId, invocation.session.id, result);
      this.runtimeHostSubagentTaskStoreService.updateTask(pluginId, task.id, (currentTask, now) => {
        markTaskCompleted(currentTask, now, result, { error: null, messageId: null, status: 'skipped' });
        currentTask.sessionMessageCount = session.messages.length;
        currentTask.sessionUpdatedAt = session.updatedAt;
      });
      return asJsonValue({
        ...result,
        sessionId: session.id,
        sessionMessageCount: session.messages.length,
        taskId: task.id,
      });
    } catch (error) {
      this.runtimeHostSubagentTaskStoreService.updateTask(pluginId, task.id, (currentTask, now) => markTaskFailed(currentTask, now, error));
      throw error;
    }
  }

  async startTask(pluginId: string, pluginDisplayName: string | undefined, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const invocation = this.resolveSubagentInvocation(pluginId, pluginDisplayName, context, params);
    const resolvedRequest = this.resolveEffectiveSubagentRequest(invocation.request);
    const writeBackTarget = readSubagentWriteBackTarget(params);
    const task = this.runtimeHostSubagentTaskStoreService.createTask({
      conversationRevision: writeBackTarget?.id ? this.runtimeHostConversationMessageService.readConversationRevision(writeBackTarget.id) ?? undefined : undefined,
      context,
      ...(resolvedRequest.request.modelId ? { modelId: resolvedRequest.request.modelId } : {}),
      pluginDisplayName,
      pluginId,
      ...(resolvedRequest.subagentType?.id ? { subagentType: resolvedRequest.subagentType.id } : {}),
      ...(resolvedRequest.subagentType?.name ? { subagentTypeName: resolvedRequest.subagentType.name } : {}),
      request: invocation.request,
      requestPreview: invocation.requestPreview,
      sessionId: invocation.session.id,
      sessionMessageCount: invocation.session.messages.length,
      sessionUpdatedAt: invocation.session.updatedAt,
      visibility: 'background' as const,
      writeBackTarget,
    });
    this.scheduleTaskExecution(task.id);
    return asJsonValue(this.runtimeHostSubagentTaskStoreService.summarizeTask(task));
  }

  private async completeTaskAsync(taskId: string): Promise<void> {
    const snapshot = this.runtimeHostSubagentTaskStoreService.readTask(taskId);
    const session = this.resolveSubagentSession({
      context: snapshot.context,
      pluginDisplayName: snapshot.pluginDisplayName,
      pluginId: snapshot.pluginId,
      task: snapshot,
    });
    if (snapshot.sessionId !== session.id || snapshot.sessionMessageCount !== session.messages.length || snapshot.sessionUpdatedAt !== session.updatedAt) {
      this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, (task) => {
        task.sessionId = session.id;
        task.sessionMessageCount = session.messages.length;
        task.sessionUpdatedAt = session.updatedAt;
      });
    }
    this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, markTaskRunning);
    try {
      const result = await this.executeSubagent({ context: snapshot.context, pluginId: snapshot.pluginId, request: snapshot.request });
      const completedSession = this.runtimeHostSubagentSessionStoreService.appendAssistantMessage(snapshot.pluginId, session.id, result);
      const writeBack = await this.writeBackResultIfNeeded(snapshot.context, result, snapshot.writeBackTarget ?? null, snapshot.writeBackConversationRevision);
      this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, (task, now) => {
        markTaskCompleted(task, now, result, writeBack);
        task.sessionId = completedSession.id;
        task.sessionMessageCount = completedSession.messages.length;
        task.sessionUpdatedAt = completedSession.updatedAt;
      });
    } catch (error) {
      this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, (task, now) => markTaskFailed(task, now, error));
    }
  }

  private scheduleTaskExecution(taskId: string): void {
    if (this.scheduledTaskIds.has(taskId)) {return;}
    this.scheduledTaskIds.add(taskId);
    setTimeout(() => {
      this.scheduledTaskIds.delete(taskId);
      void this.completeTaskAsync(taskId);
    }, 0);
  }

  private resolveSubagentInvocation(
    pluginId: string,
    pluginDisplayName: string | undefined,
    context: PluginCallContext,
    params: JsonObject,
  ): ResolvedSubagentInvocation {
    const resumeSessionId = readOptionalString(params, 'sessionId') ?? undefined;
    const nextRequest = readSubagentRequest(params, { allowMissingMessages: Boolean(resumeSessionId) });
    if (!resumeSessionId) {
      const resolved = this.resolveEffectiveSubagentRequest(nextRequest);
      const session = this.runtimeHostSubagentSessionStoreService.createSession({
        context,
        ...(nextRequest.description ? { description: nextRequest.description } : {}),
        messages: nextRequest.messages,
        modelId: resolved.request.modelId,
        pluginDisplayName,
        pluginId,
        ...(resolved.request.system ? { system: resolved.request.system } : {}),
        ...(resolved.request.toolNames ? { toolNames: resolved.request.toolNames } : {}),
        ...(resolved.request.variant ? { variant: resolved.request.variant } : {}),
        ...(resolved.request.providerOptions ? { providerOptions: resolved.request.providerOptions } : {}),
        ...(resolved.request.headers ? { headers: resolved.request.headers } : {}),
        ...(typeof resolved.request.maxOutputTokens === 'number' ? { maxOutputTokens: resolved.request.maxOutputTokens } : {}),
        ...(nextRequest.subagentType ? { subagentType: nextRequest.subagentType } : {}),
        ...(resolved.subagentType?.name ? { subagentTypeName: resolved.subagentType.name } : {}),
        providerId: resolved.request.providerId,
      });
      return {
        request: nextRequest,
        requestPreview: readSubagentMessagePreview(nextRequest.messages.at(-1)?.content) ?? nextRequest.description ?? 'structured subagent request',
        session,
      };
    }
    const session = this.runtimeHostSubagentSessionStoreService.getSession(pluginId, resumeSessionId);
    const previousRequest = buildSubagentRequestFromSession(session);
    const mergedRequest = mergeSubagentRequest(
      previousRequest,
      nextRequest,
      session.messages,
      nextRequest.messages,
    );
    const resolved = this.resolveEffectiveSubagentRequest(mergedRequest);
    const updatedSession = this.runtimeHostSubagentSessionStoreService.updateSession(pluginId, session.id, (currentSession) => {
      currentSession.messages = cloneJsonValue(mergedRequest.messages);
      currentSession.modelId = resolved.request.modelId;
      currentSession.providerId = resolved.request.providerId;
      currentSession.system = resolved.request.system;
      currentSession.toolNames = resolved.request.toolNames ? cloneJsonValue(resolved.request.toolNames) as string[] : undefined;
      currentSession.variant = resolved.request.variant;
      currentSession.providerOptions = resolved.request.providerOptions ? cloneJsonValue(resolved.request.providerOptions) as JsonObject : undefined;
      currentSession.headers = resolved.request.headers ? cloneJsonValue(resolved.request.headers) as Record<string, string> : undefined;
      currentSession.maxOutputTokens = resolved.request.maxOutputTokens;
      if (mergedRequest.description) {
        currentSession.description = mergedRequest.description;
      } else {
        delete currentSession.description;
      }
      if (mergedRequest.subagentType) {
        currentSession.subagentType = mergedRequest.subagentType;
      } else {
        delete currentSession.subagentType;
      }
      if (resolved.subagentType?.name) {
        currentSession.subagentTypeName = resolved.subagentType.name;
      } else {
        delete currentSession.subagentTypeName;
      }
    });
    return {
      request: mergedRequest,
      requestPreview: readSubagentMessagePreview(nextRequest.messages.at(-1)?.content) ?? nextRequest.description ?? 'structured subagent request',
      session: updatedSession,
    };
  }

  private resolveSubagentSession(input: {
    context: PluginCallContext;
    pluginDisplayName: string | undefined;
    pluginId: string;
    task: PluginSubagentTaskDetail;
  }): RuntimeSubagentSessionRecord {
    if (input.task.sessionId) {
      try {
        return this.runtimeHostSubagentSessionStoreService.getSession(input.pluginId, input.task.sessionId);
      } catch {
        // 兼容旧任务记录：若 session 文件尚不存在，则按历史请求即时重建。
      }
    }
    const historyMessages = [
      ...input.task.request.messages,
      ...(input.task.result?.message?.content
        ? [{
            content: input.task.result.message.content,
            role: 'assistant' as const,
          }]
        : []),
    ];
    return this.runtimeHostSubagentSessionStoreService.createSession({
      context: input.context,
      ...(input.task.description ? { description: input.task.description } : {}),
      messages: historyMessages,
      modelId: input.task.modelId,
      pluginDisplayName: input.pluginDisplayName ?? input.task.pluginDisplayName,
      pluginId: input.pluginId,
      ...(input.task.request.system ? { system: input.task.request.system } : {}),
      ...(input.task.request.toolNames ? { toolNames: input.task.request.toolNames } : {}),
      ...(input.task.request.variant ? { variant: input.task.request.variant } : {}),
      ...(input.task.request.providerOptions ? { providerOptions: input.task.request.providerOptions } : {}),
      ...(input.task.request.headers ? { headers: input.task.request.headers } : {}),
      ...(typeof input.task.request.maxOutputTokens === 'number' ? { maxOutputTokens: input.task.request.maxOutputTokens } : {}),
      ...(input.task.subagentType ? { subagentType: input.task.subagentType } : {}),
      ...(input.task.subagentTypeName ? { subagentTypeName: input.task.subagentTypeName } : {}),
      providerId: input.task.providerId,
      taskId: input.task.id,
    });
  }

  private async writeBackResultIfNeeded(context: PluginCallContext, result: PluginSubagentRunResult, target: PluginMessageTargetInfo | null, conversationRevision?: string) {
    if (!target) {return { error: null, messageId: null, status: 'skipped' as const };}
    try {
      if (conversationRevision && this.runtimeHostConversationMessageService.readConversationRevision(target.id) !== conversationRevision) {throw new Error(`Conversation revision changed: ${target.id}`);}
      const sent = await this.runtimeHostConversationMessageService.sendMessage(context, { content: result.text, model: result.modelId, provider: result.providerId, target: { id: target.id, type: target.type } });
      const messageId = readJsonObject(sent)?.id;
      return { error: null, messageId: typeof messageId === 'string' ? messageId : null, status: 'sent' as const };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '后台子代理结果回写失败', messageId: null, status: 'failed' as const };
    }
  }

  private async executeSubagent(input: { context: PluginCallContext; pluginId: string; request: PluginSubagentRequest }): Promise<PluginSubagentRunResult> {
    const resolvedRequest = this.resolveEffectiveSubagentRequest(input.request);
    const beforeHooks = await runDispatchableHookChain<PluginSubagentRequest, SubagentBeforeRunHookResult, PluginSubagentRunResult>({
      applyResponse: (request, response) => readSubagentBeforeRunResponse(request, response),
      hookName: 'subagent:before-run',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (request) => asJsonValue({ context: input.context, pluginId: input.pluginId, request }) as JsonObject,
      initialState: resolvedRequest.request,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
    if ('shortCircuitResult' in beforeHooks) {return beforeHooks.shortCircuitResult;}
    const request = beforeHooks.state;
    const tools = await this.toolRegistryService.buildToolSet({ allowedToolNames: request.toolNames, context: input.context, excludedPluginId: input.pluginId });
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
    const result = await collectSubagentRunResult({ finishReason: stream.finishReason, fullStream: stream.fullStream, modelId: stream.modelId, providerId: stream.providerId });
    return applyMutatingDispatchableHooks({
      applyMutation: (nextResult, response) => applySubagentAfterRunMutation(nextResult, response as unknown as Extract<SubagentAfterRunHookResult, { action: 'mutate' }>),
      hookName: 'subagent:after-run',
      kernel: this.runtimeHostPluginDispatchService,
      payload: result,
      mapPayload: (nextResult) => asJsonValue({ context: input.context, pluginId: input.pluginId, request, result: nextResult }) as JsonObject,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
  }

  listTypes() {
    return this.runtimeHostSubagentTypeRegistryService.listTypes();
  }

  private resolveEffectiveSubagentRequest(request: PluginSubagentRequest): {
    subagentType: ReturnType<RuntimeHostSubagentTypeRegistryService['getType']>;
    request: PluginSubagentRequest;
  } {
    if (!request.subagentType) {
      return {
        subagentType: null,
        request: cloneJsonValue(request) as PluginSubagentRequest,
      };
    }
    const subagentType = this.runtimeHostSubagentTypeRegistryService.getType(request.subagentType);
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
        ...(subagentType.toolNames && !request.toolNames ? { toolNames: cloneJsonValue(subagentType.toolNames) as string[] } : {}),
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

function applySubagentAfterRunMutation(
  nextResult: PluginSubagentRunResult,
  mutation: Extract<SubagentAfterRunHookResult, { action: 'mutate' }>,
): PluginSubagentRunResult {
  const text = typeof mutation.text === 'string' ? mutation.text : nextResult.text;
  return {
    ...cloneJsonValue(nextResult) as PluginSubagentRunResult,
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...('finishReason' in mutation ? { finishReason: mutation.finishReason ?? undefined } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults } : {}),
    ...(typeof mutation.text === 'string' ? { message: { ...nextResult.message, content: text }, text } : {}),
  };
}

function readSubagentBeforeRunResponse(request: PluginSubagentRequest, response: SubagentBeforeRunHookResult) {
  if (response.action === 'short-circuit') {
    return {
      shortCircuitResult: {
        ...(response.finishReason !== undefined ? { finishReason: response.finishReason } : {}),
        message: { content: response.text, role: 'assistant' as const },
        modelId: response.modelId ?? request.modelId ?? 'unknown-model',
        providerId: response.providerId ?? request.providerId ?? 'unknown-provider',
        text: response.text,
        toolCalls: response.toolCalls ?? [],
        toolResults: response.toolResults ?? [],
      },
    };
  }
  if (response.action === 'pass') {return { state: cloneJsonValue(request) as PluginSubagentRequest };}
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

async function collectSubagentRunResult(input: { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; modelId: string; providerId: string }): Promise<PluginSubagentRunResult> {
  let text = '';
  const toolCalls: PluginSubagentRunResult['toolCalls'] = [];
  const toolResults: PluginSubagentRunResult['toolResults'] = [];
  for await (const rawPart of input.fullStream) {
    const part = readAssistantStreamPart(rawPart);
    if (!part) {continue;}
    if (part.type === 'text-delta') {text += part.text; continue;}
    if (part.type === 'tool-call') {toolCalls.push({ input: asJsonValue(part.input), toolCallId: part.toolCallId, toolName: part.toolName }); continue;}
    toolResults.push({ output: asJsonValue(part.output), toolCallId: part.toolCallId, toolName: part.toolName });
  }
  const finishReason = await input.finishReason;
  return {
    ...(finishReason !== undefined ? { finishReason: finishReason === null ? null : String(finishReason) } : {}),
    message: { content: text, role: 'assistant' },
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

function readSubagentMessagePreview(content: PluginSubagentRequest['messages'][number]['content'] | undefined): string | null {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  return text.length > 0 ? text : null;
}

function mergeSubagentRequest(
  previous: PluginSubagentRequest,
  next: PluginSubagentRequest,
  sessionMessages: PluginLlmMessage[],
  nextMessages: PluginLlmMessage[],
): PluginSubagentRequest {
  return {
    ...(previous.description ? { description: previous.description } : {}),
    ...(previous.subagentType ? { subagentType: previous.subagentType } : {}),
    ...(previous.providerId ? { providerId: previous.providerId } : {}),
    ...(previous.modelId ? { modelId: previous.modelId } : {}),
    ...(previous.system ? { system: previous.system } : {}),
    messages: [
      ...cloneJsonValue(sessionMessages) as PluginSubagentRequest['messages'],
      ...cloneJsonValue(nextMessages) as PluginSubagentRequest['messages'],
    ],
    ...(previous.toolNames ? { toolNames: cloneJsonValue(previous.toolNames) as string[] } : {}),
    ...(previous.variant ? { variant: previous.variant } : {}),
    ...(previous.providerOptions ? { providerOptions: cloneJsonValue(previous.providerOptions) as JsonObject } : {}),
    ...(previous.headers ? { headers: cloneJsonValue(previous.headers) as Record<string, string> } : {}),
    ...(typeof previous.maxOutputTokens === 'number' ? { maxOutputTokens: previous.maxOutputTokens } : {}),
    ...(next.providerId ? { providerId: next.providerId } : {}),
    ...(next.modelId ? { modelId: next.modelId } : {}),
    ...(next.system ? { system: next.system } : {}),
    ...(next.toolNames ? { toolNames: cloneJsonValue(next.toolNames) as string[] } : {}),
    ...(next.variant ? { variant: next.variant } : {}),
    ...(next.providerOptions ? { providerOptions: cloneJsonValue(next.providerOptions) as JsonObject } : {}),
    ...(next.headers ? { headers: cloneJsonValue(next.headers) as Record<string, string> } : {}),
    ...(typeof next.maxOutputTokens === 'number' ? { maxOutputTokens: next.maxOutputTokens } : {}),
    ...(next.description ? { description: next.description } : {}),
    ...(next.subagentType ? { subagentType: next.subagentType } : {}),
  };
}

function buildSubagentRequestFromSession(session: RuntimeSubagentSessionRecord): PluginSubagentRequest {
  return {
    ...(session.description ? { description: session.description } : {}),
    ...(session.subagentType ? { subagentType: session.subagentType } : {}),
    ...(session.providerId ? { providerId: session.providerId } : {}),
    ...(session.modelId ? { modelId: session.modelId } : {}),
    ...(session.system ? { system: session.system } : {}),
    messages: cloneJsonValue(session.messages) as PluginLlmMessage[],
    ...(session.toolNames ? { toolNames: cloneJsonValue(session.toolNames) as string[] } : {}),
    ...(session.variant ? { variant: session.variant } : {}),
    ...(session.providerOptions ? { providerOptions: cloneJsonValue(session.providerOptions) as JsonObject } : {}),
    ...(session.headers ? { headers: cloneJsonValue(session.headers) as Record<string, string> } : {}),
    ...(typeof session.maxOutputTokens === 'number' ? { maxOutputTokens: session.maxOutputTokens } : {}),
  };
}

function markTaskRunning(task: RuntimeSubagentTaskRecord, now: string): void { task.startedAt = task.startedAt ?? now; task.status = 'running'; }
function markTaskCompleted(task: RuntimeSubagentTaskRecord, now: string, result: PluginSubagentRunResult, writeBack: { error: string | null; messageId: string | null; status: 'failed' | 'sent' | 'skipped' }): void { task.startedAt = task.startedAt ?? now; task.status = 'completed'; task.finishedAt = now; task.error = undefined; task.result = result; task.resultPreview = result.text; task.writeBackError = writeBack.error ?? undefined; task.writeBackMessageId = writeBack.messageId ?? undefined; task.writeBackStatus = writeBack.status; }
function markTaskFailed(task: RuntimeSubagentTaskRecord, now: string, error: unknown): void { task.startedAt = task.startedAt ?? now; task.status = 'error'; task.error = error instanceof Error ? error.message : '后台子代理任务执行失败'; task.finishedAt = now; task.result = null; task.resultPreview = undefined; task.writeBackError = undefined; task.writeBackMessageId = undefined; task.writeBackStatus = 'skipped'; }
