import type { AiModelUsage, ChatMessageCustomBlock, ChatMessageMetadata, ChatMessagePart, ChatMessageStatus, JsonValue, PluginSubagentToolCall, PluginSubagentToolResult, SSEEvent } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { createConversationHistorySignatureFromHistoryMessages } from './conversation-history-signature';
import type { ConversationCompactionContinuationState } from './conversation-compaction-continuation';
import { appendConversationModelUsageMetadata, readConversationModelUsageAnnotation } from './conversation-model-usage.annotation';
import { RuntimeToolPermissionService } from '../execution/runtime/runtime-tool-permission.service';
import { ConversationMessageService } from '../runtime/host/conversation-message.service';
import { ConversationStoreService } from '../runtime/host/conversation-store.service';
import { ConversationTodoService } from '../runtime/host/conversation-todo.service';
import { cloneJsonValue, readAssistantRawCustomBlocks, readAssistantStreamPart } from '../runtime/host/host-input.codec';
import { createServerLogger } from '../core/logging/server-logger';

export type ConversationTaskToolCall = PluginSubagentToolCall & Record<string, JsonValue>;
export type ConversationTaskToolResult = PluginSubagentToolResult & Record<string, JsonValue>;
export type ConversationTaskEvent = Extract<SSEEvent, { type: 'finish' | 'message-metadata' | 'message-patch' | 'permission-request' | 'permission-resolved' | 'status' | 'todo-updated' | 'text-delta' | 'tool-call' | 'tool-result' }>;
export type ResolvedConversationTaskStreamSource = {
  modelId: string;
  providerId: string;
  requestHistorySignature?: string;
  stream: { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; usage?: Promise<AiModelUsage | undefined> };
};

export interface CompletedConversationTaskResult {
  assistantMessageId: string;
  content: string;
  continuationState: ConversationCompactionContinuationState;
  conversationId: string;
  metadata?: ChatMessageMetadata;
  modelId: string;
  parts: ChatMessagePart[];
  providerId: string;
  toolCalls: ConversationTaskToolCall[];
  toolResults: ConversationTaskToolResult[];
}

export interface StartConversationTaskInput {
  assistantMessageId: string;
  conversationId: string;
  createStream:
    | ((abortSignal: AbortSignal) => Promise<ResolvedConversationTaskStreamSource>)
    | ((abortSignal: AbortSignal) => ResolvedConversationTaskStreamSource);
  modelId: string;
  onComplete?:
    | ((result: CompletedConversationTaskResult) => Promise<CompletedConversationTaskResult | void>)
    | ((result: CompletedConversationTaskResult) => CompletedConversationTaskResult | void);
  onSent?: ((result: CompletedConversationTaskResult) => Promise<void>) | ((result: CompletedConversationTaskResult) => void);
  providerId: string;
  resolveErrorMessage?: ((error: unknown) => Promise<string | null>) | ((error: unknown) => string | null);
}

type ConversationTaskPermissionEvent = Parameters<Parameters<RuntimeToolPermissionService['subscribe']>[1]>[0];
type ConversationTaskCustomBlockUpdate = { key: string; kind: 'json'; value: JsonValue } | { key: string; kind: 'text'; value: string };
type ConversationTaskOutcome = { status: 'completed' | 'stopped' } | { error: string; status: 'error' };
type ConversationTaskSnapshot = Omit<CompletedConversationTaskResult, 'assistantMessageId' | 'conversationId'>;
type ConversationTaskRuntime = Omit<StartConversationTaskInput, 'createStream'> & {
  requestHistorySignature?: string;
  state: {
    content: string;
    hasAssistantTextOutput: boolean;
    hasToolActivity: boolean;
    metadata?: ChatMessageMetadata;
    toolCalls: ConversationTaskToolCall[];
    toolResults: ConversationTaskToolResult[];
  };
};

interface ConversationTaskHandle {
  abortController: AbortController;
  completion: Promise<void>;
  listeners: Set<(event: ConversationTaskEvent) => void>;
}

@Injectable()
export class ConversationTaskService {
  private readonly logger = createServerLogger(ConversationTaskService.name);
  private readonly tasks = new Map<string, ConversationTaskHandle>();

  constructor(
    private readonly conversationMessages: ConversationMessageService,
    private readonly conversationStore: ConversationStoreService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    private readonly conversationTodos: ConversationTodoService,
  ) {}

  startTask(input: StartConversationTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {throw new Error(`Conversation task already exists for message ${input.assistantMessageId}`);}
    let resolveCompletion: () => void = () => undefined;
    const handle: ConversationTaskHandle = { abortController: new AbortController(), completion: new Promise<void>((resolve) => { resolveCompletion = resolve; }), listeners: new Set() };
    this.tasks.set(input.assistantMessageId, handle);
    setTimeout(() => void this.runTask(handle, input).finally(() => { this.tasks.delete(input.assistantMessageId); resolveCompletion(); }), 0);
  }

  subscribe(messageId: string, listener: (event: ConversationTaskEvent) => void): () => void {
    const task = this.tasks.get(messageId);
    if (!task) {return () => undefined;}
    task.listeners.add(listener);
    return () => task.listeners.delete(listener);
  }

  async waitForTask(messageId: string): Promise<void> { await this.tasks.get(messageId)?.completion; }

  async stopTask(messageId: string): Promise<boolean> {
    const task = this.tasks.get(messageId);
    if (!task) {return false;}
    task.abortController.abort(new Error('用户主动停止了本次生成'));
    await task.completion;
    return true;
  }

  private async runTask(task: ConversationTaskHandle, input: StartConversationTaskInput): Promise<void> {
    const runtime: ConversationTaskRuntime = {
      ...input,
      state: {
        content: '',
        hasAssistantTextOutput: false,
        hasToolActivity: false,
        toolCalls: [],
        toolResults: [],
      },
    };
    const unsubscribePermission = this.runtimeToolPermissionService.subscribe(input.conversationId, (event) => {
      this.emit(task, toConversationTaskPermissionEvent(event, input.assistantMessageId));
    });
    const unsubscribeTodo = this.conversationTodos.subscribe(input.conversationId, (event) => {
      this.emit(task, { conversationId: event.sessionId, todos: cloneJsonValue(event.todos), type: 'todo-updated' });
    });

    try {
      const streamSource = await input.createStream(task.abortController.signal);
      const stream = normalizeConversationTaskStream(streamSource.stream);
      runtime.requestHistorySignature = streamSource.requestHistorySignature;
      runtime.modelId = streamSource.modelId;
      runtime.providerId = streamSource.providerId;
      await this.writeTaskSnapshot(runtime, 'streaming');
      this.emit(task, { messageId: runtime.assistantMessageId, status: 'streaming', type: 'status' });

      for await (const rawPart of stream.fullStream) {
        const events = readConversationTaskEvents(runtime.state, runtime.assistantMessageId, runtime.providerId, rawPart);
        if (events.length === 0) {continue;}
        await this.writeTaskSnapshot(runtime, 'streaming');
        this.emitAll(task, events);
      }

      const usage = await readConversationTaskUsage(stream.usage);
      if (usage) {
        runtime.state.metadata = appendConversationModelUsageMetadata(runtime.state.metadata, {
          ...usage,
          modelId: runtime.modelId,
          providerId: runtime.providerId,
          ...(runtime.requestHistorySignature ? { requestHistorySignature: runtime.requestHistorySignature } : {}),
        });
      }
      await this.finishTask(task, runtime, { status: task.abortController.signal.aborted ? 'stopped' : 'completed' });
    } catch (error) {
      await this.finishTask(task, runtime, await readConversationTaskOutcome(task.abortController.signal, runtime.resolveErrorMessage, error));
    } finally {
      unsubscribePermission();
      unsubscribeTodo();
    }
  }

  private async finishTask(task: ConversationTaskHandle, runtime: ConversationTaskRuntime, outcome: ConversationTaskOutcome): Promise<void> {
    const snapshot = await this.writeTaskSnapshot(runtime, outcome.status, 'error' in outcome ? outcome.error : null);
    if (outcome.status !== 'completed') {
      this.emitAll(task, [
        { ...('error' in outcome ? { error: outcome.error } : {}), messageId: runtime.assistantMessageId, status: outcome.status, type: 'status' },
        { messageId: runtime.assistantMessageId, status: outcome.status, type: 'finish' },
      ]);
      return;
    }

    const completed: CompletedConversationTaskResult = { assistantMessageId: runtime.assistantMessageId, conversationId: runtime.conversationId, ...snapshot };
    const patched = await runtime.onComplete?.(completed);
    let finalResult = patched ?? completed;

    if (patched && hasPatchedTaskResult(completed, patched)) {
      await this.conversationMessages.writeMessage(runtime.conversationId, runtime.assistantMessageId, readConversationTaskMessageBody(patched, 'completed'));
      this.emit(task, { content: patched.content, messageId: runtime.assistantMessageId, ...(patched.parts.length > 0 ? { parts: patched.parts } : {}), type: 'message-patch' });
    }

    const usageAnnotatedResult = await this.attachResponseHistoryUsageSignature(runtime, finalResult);
    if (JSON.stringify(finalResult.metadata ?? null) !== JSON.stringify(usageAnnotatedResult.metadata ?? null)) {
      this.emit(task, {
        messageId: runtime.assistantMessageId,
        metadata: cloneJsonValue(usageAnnotatedResult.metadata ?? {}),
        type: 'message-metadata',
      });
    }
    finalResult = usageAnnotatedResult;
    this.emit(task, { messageId: runtime.assistantMessageId, status: 'completed', type: 'finish' });
    try {
      await runtime.onSent?.(finalResult);
    } catch (error) {
      this.logger.error(`会话 ${runtime.conversationId} 的发送后附带动作失败: ${error instanceof Error ? error.message : '未知错误'}`, {
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private async writeTaskSnapshot(runtime: ConversationTaskRuntime, status: ChatMessageStatus, error: string | null = null): Promise<ConversationTaskSnapshot> {
    const snapshot: ConversationTaskSnapshot = {
      content: runtime.state.content.trim(),
      continuationState: {
        hasAssistantTextOutput: runtime.state.hasAssistantTextOutput,
        hasToolActivity: runtime.state.hasToolActivity,
      },
      ...(runtime.state.metadata ? { metadata: finalizeConversationTaskMetadata(runtime.state.metadata, status) } : {}),
      modelId: runtime.modelId,
      parts: toAssistantParts(runtime.state.content),
      providerId: runtime.providerId,
      toolCalls: runtime.state.toolCalls.map((entry) => ({ ...entry })),
      toolResults: runtime.state.toolResults.map((entry) => ({ ...entry })),
    };
    await this.conversationMessages.writeMessage(runtime.conversationId, runtime.assistantMessageId, readConversationTaskMessageBody(snapshot, status, error));
    return snapshot;
  }

  private emit(task: ConversationTaskHandle, event: ConversationTaskEvent): void { for (const listener of task.listeners) {listener(event);} }
  private emitAll(task: ConversationTaskHandle, events: readonly ConversationTaskEvent[]): void { events.forEach((event) => this.emit(task, event)); }

  private async attachResponseHistoryUsageSignature(
    runtime: ConversationTaskRuntime,
    result: CompletedConversationTaskResult,
  ): Promise<CompletedConversationTaskResult> {
    const usage = readConversationModelUsageAnnotation(result.metadata, {
      modelId: result.modelId,
      providerId: result.providerId,
    });
    if (!usage) {
      return result;
    }
    const history = this.conversationStore.readConversationHistory(
      runtime.conversationId,
    ) as { messages?: unknown };
    if (!Array.isArray(history.messages)) {
      return result;
    }
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(
      history.messages as Parameters<typeof createConversationHistorySignatureFromHistoryMessages>[0],
    );
    const metadata = appendConversationModelUsageMetadata(result.metadata, {
      ...usage,
      modelId: result.modelId,
      providerId: result.providerId,
      ...(runtime.requestHistorySignature ? { requestHistorySignature: runtime.requestHistorySignature } : {}),
      responseHistorySignature,
    });
    if (JSON.stringify(result.metadata ?? null) === JSON.stringify(metadata)) {
      return result;
    }
    const nextResult = { ...result, metadata };
    await this.conversationMessages.writeMessage(
      runtime.conversationId,
      runtime.assistantMessageId,
      readConversationTaskMessageBody(nextResult, 'completed'),
    );
    return nextResult;
  }
}

function toConversationTaskPermissionEvent(event: ConversationTaskPermissionEvent, assistantMessageId: string): ConversationTaskEvent {
  return event.type === 'request'
    ? { messageId: event.request.messageId ?? assistantMessageId, request: cloneJsonValue(event.request), type: 'permission-request' }
    : { messageId: event.messageId ?? assistantMessageId, result: cloneJsonValue(event.result), type: 'permission-resolved' };
}

async function readConversationTaskOutcome(abortSignal: AbortSignal, resolver: StartConversationTaskInput['resolveErrorMessage'], error: unknown): Promise<ConversationTaskOutcome> {
  if (abortSignal.aborted) {return { status: 'stopped' };}
  return { error: await resolver?.(error) ?? (error instanceof Error ? error.message : 'Conversation generation failed'), status: 'error' };
}

function normalizeConversationTaskStream(stream: ResolvedConversationTaskStreamSource['stream']): ResolvedConversationTaskStreamSource['stream'] {
  return {
    ...stream,
    ...(Object.prototype.hasOwnProperty.call(stream, 'finishReason') ? { finishReason: readSafeTaskValue(stream.finishReason) } : {}),
    ...(Object.prototype.hasOwnProperty.call(stream, 'usage') ? { usage: readSafeTaskUsagePromise(stream.usage) } : {}),
  };
}

async function readConversationTaskUsage(usage: Promise<AiModelUsage | undefined> | undefined): Promise<AiModelUsage | undefined> {
  try { return usage ? await usage : undefined; } catch { return undefined; }
}

function readSafeTaskValue<T>(value: PromiseLike<T> | T | undefined): Promise<T | undefined> | T | undefined {
  return value === undefined ? undefined : Promise.resolve(value).catch(() => undefined);
}

function readSafeTaskUsagePromise<T>(value: PromiseLike<T> | T | undefined): Promise<T | undefined> | undefined {
  return value === undefined ? undefined : Promise.resolve(value).catch(() => undefined);
}

function readConversationTaskMessageBody(
  input: Pick<CompletedConversationTaskResult, 'content' | 'metadata' | 'modelId' | 'parts' | 'providerId' | 'toolCalls' | 'toolResults'>,
  status: ChatMessageStatus,
  error: string | null = null,
) {
  return { content: input.content, error, metadata: input.metadata, model: input.modelId, parts: input.parts, provider: input.providerId, status, toolCalls: input.toolCalls, toolResults: input.toolResults };
}

function readConversationTaskEvents(
  state: ConversationTaskRuntime['state'],
  messageId: string,
  providerId: string,
  rawPart: unknown,
): ConversationTaskEvent[] {
  const metadataEvents = readConversationTaskMetadataEvents(state, messageId, providerId, readAssistantRawCustomBlocks(rawPart));
  const part = readAssistantStreamPart(rawPart);
  if (!part) {return metadataEvents;}
  if (part.type === 'text-delta') {
    state.content += part.text;
    state.hasAssistantTextOutput = state.hasAssistantTextOutput || part.text.trim().length > 0;
    return [...metadataEvents, { messageId, text: part.text, type: 'text-delta' }];
  }
  if (part.type === 'tool-call') {
    state.hasToolActivity = true;
    state.toolCalls.push({ input: part.input, toolCallId: part.toolCallId, toolName: part.toolName });
    return [...metadataEvents, { input: part.input, messageId, toolCallId: part.toolCallId, toolName: part.toolName, type: 'tool-call' }];
  }
  const output = compactConversationToolResultOutput(part.output);
  state.hasToolActivity = true;
  state.toolResults.push({ output, toolCallId: part.toolCallId, toolName: part.toolName });
  return [...metadataEvents, { messageId, output, toolCallId: part.toolCallId, toolName: part.toolName, type: 'tool-result' }];
}

function readConversationTaskMetadataEvents(
  state: ConversationTaskRuntime['state'],
  messageId: string,
  providerId: string,
  updates: ConversationTaskCustomBlockUpdate[],
): ConversationTaskEvent[] {
  const metadata = applyConversationTaskMetadataUpdates(state.metadata, providerId, updates);
  if (metadata === state.metadata) {return [];}
  state.metadata = metadata;
  return metadata ? [{ messageId, metadata: cloneJsonValue(metadata), type: 'message-metadata' }] : [];
}

function applyConversationTaskMetadataUpdates(
  currentMetadata: ChatMessageMetadata | undefined,
  providerId: string,
  updates: ConversationTaskCustomBlockUpdate[],
): ChatMessageMetadata | undefined {
  if (updates.length === 0) {return currentMetadata;}
  const metadata = cloneJsonValue(currentMetadata ?? {}) as ChatMessageMetadata;
  const customBlocks = [...(metadata.customBlocks ?? [])];
  let changed = false;
  for (const update of updates) {
    const blockId = `custom-field:${update.key}`;
    const nextBlock = readConversationTaskCustomBlock(customBlocks.find((entry) => entry.id === blockId), blockId, providerId, update);
    const index = customBlocks.findIndex((entry) => entry.id === blockId);
    if (index < 0) {
      customBlocks.push(nextBlock);
      changed = true;
      continue;
    }
    if (JSON.stringify(customBlocks[index]) !== JSON.stringify(nextBlock)) {
      customBlocks[index] = nextBlock;
      changed = true;
    }
  }
  return changed ? { ...metadata, customBlocks } : currentMetadata;
}

function readConversationTaskCustomBlock(
  currentBlock: ChatMessageCustomBlock | undefined,
  blockId: string,
  providerId: string,
  update: ConversationTaskCustomBlockUpdate,
): ChatMessageCustomBlock {
  const base = { id: blockId, source: { key: update.key, origin: 'ai-sdk.raw' as const, providerId }, state: 'streaming' as const, title: formatCustomBlockTitle(update.key) };
  return update.kind === 'text'
    ? { ...base, kind: 'text', text: `${currentBlock?.kind === 'text' ? currentBlock.text : ''}${update.value}` }
    : { ...base, data: cloneJsonValue(update.value), kind: 'json' };
}

function compactConversationToolResultOutput(value: JsonValue): JsonValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneJsonValue(value);
  }
  const record = value as Record<string, JsonValue>;
  if ((record.kind === 'tool:text' && typeof record.value === 'string') || record.kind === 'tool:json') {
    return cloneJsonValue({
      kind: record.kind,
      value: cloneJsonValue(record.value ?? null),
    });
  }
  return cloneJsonValue(value);
}

function finalizeConversationTaskMetadata(metadata: ChatMessageMetadata | undefined, status: ChatMessageStatus): ChatMessageMetadata | undefined {
  return !metadata?.customBlocks?.length || status === 'pending' || status === 'streaming'
    ? metadata
    : { ...metadata, customBlocks: metadata.customBlocks.map((block) => ({ ...block, state: 'done' })) };
}

function hasPatchedTaskResult(original: CompletedConversationTaskResult, patched: CompletedConversationTaskResult): boolean {
  return original.content !== patched.content
    || JSON.stringify(original.metadata ?? null) !== JSON.stringify(patched.metadata ?? null)
    || original.providerId !== patched.providerId
    || original.modelId !== patched.modelId
    || JSON.stringify(original.parts) !== JSON.stringify(patched.parts)
    || JSON.stringify(original.toolCalls) !== JSON.stringify(patched.toolCalls)
    || JSON.stringify(original.toolResults) !== JSON.stringify(patched.toolResults);
}

function formatCustomBlockTitle(key: string): string {
  const normalized = key.trim().replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.split(' ').map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ') : key;
}

function toAssistantParts(content: string): ChatMessagePart[] {
  const text = content.trim();
  return text ? [{ text, type: 'text' }] : [];
}
