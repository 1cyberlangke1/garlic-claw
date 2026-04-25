import type {
  ChatMessageCustomBlock,
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessageStatus,
  JsonValue,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  SSEEvent,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { RuntimeToolPermissionService } from '../execution/runtime/runtime-tool-permission.service';
import { RuntimeHostConversationMessageService } from '../runtime/host/runtime-host-conversation-message.service';
import { cloneJsonValue, readAssistantRawCustomBlocks, readAssistantStreamPart } from '../runtime/host/runtime-host-values';

export type ConversationTaskToolCall = PluginSubagentToolCall & Record<string, JsonValue>;
export type ConversationTaskToolResult = PluginSubagentToolResult & Record<string, JsonValue>;
export type ConversationTaskEvent = Extract<
  SSEEvent,
  {
    type:
      | 'finish'
      | 'message-metadata'
      | 'message-patch'
      | 'permission-request'
      | 'permission-resolved'
      | 'status'
      | 'text-delta'
      | 'tool-call'
      | 'tool-result';
  }
>;
export type ResolvedConversationTaskStreamSource = {
  modelId: string;
  providerId: string;
  stream: {
    finishReason?: Promise<unknown> | unknown;
    fullStream: AsyncIterable<unknown>;
  };
};

export interface CompletedConversationTaskResult {
  assistantMessageId: string;
  content: string;
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
type ConversationTaskCustomBlockUpdate =
  | { key: string; kind: 'json'; value: JsonValue }
  | { key: string; kind: 'text'; value: string };
type ConversationTaskOutcome =
  | { status: 'completed' | 'stopped' }
  | { error: string; status: 'error' };
type ConversationTaskRuntime = Omit<StartConversationTaskInput, 'createStream'> & { state: ConversationTaskState };
type ConversationTaskSnapshot = Omit<CompletedConversationTaskResult, 'assistantMessageId' | 'conversationId'>;

interface ConversationTaskHandle {
  abortController: AbortController;
  completion: Promise<void>;
  listeners: Set<(event: ConversationTaskEvent) => void>;
}

interface ConversationTaskState {
  content: string;
  metadata?: ChatMessageMetadata;
  toolCalls: ConversationTaskToolCall[];
  toolResults: ConversationTaskToolResult[];
}

@Injectable()
export class ConversationTaskService {
  private readonly tasks = new Map<string, ConversationTaskHandle>();

  constructor(
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
  ) {}

  startTask(input: StartConversationTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {
      throw new Error(`Conversation task already exists for message ${input.assistantMessageId}`);
    }
    let resolveCompletion: () => void = () => undefined;
    const handle: ConversationTaskHandle = {
      abortController: new AbortController(),
      completion: new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      }),
      listeners: new Set(),
    };
    this.tasks.set(input.assistantMessageId, handle);
    setTimeout(() => {
      void this.runTask(handle, input).finally(() => {
        this.tasks.delete(input.assistantMessageId);
        resolveCompletion();
      });
    }, 0);
  }

  subscribe(messageId: string, listener: (event: ConversationTaskEvent) => void): () => void {
    const task = this.tasks.get(messageId);
    if (!task) {
      return () => undefined;
    }
    task.listeners.add(listener);
    return () => task.listeners.delete(listener);
  }

  async waitForTask(messageId: string): Promise<void> {
    await this.tasks.get(messageId)?.completion;
  }

  async stopTask(messageId: string): Promise<boolean> {
    const task = this.tasks.get(messageId);
    if (!task) {
      return false;
    }
    task.abortController.abort(new Error('用户主动停止了本次生成'));
    await task.completion;
    return true;
  }

  private async runTask(task: ConversationTaskHandle, input: StartConversationTaskInput): Promise<void> {
    const runtime: ConversationTaskRuntime = { ...input, state: { content: '', toolCalls: [], toolResults: [] } };
    const unsubscribePermission = this.runtimeToolPermissionService.subscribe(
      input.conversationId,
      (event) => this.emit(task, readConversationTaskPermissionEvent(event, input.assistantMessageId)),
    );
    try {
      const streamSource = await input.createStream(task.abortController.signal);
      runtime.modelId = streamSource.modelId;
      runtime.providerId = streamSource.providerId;
      await this.persistTaskSnapshot(runtime, 'streaming');
      this.emit(task, { messageId: runtime.assistantMessageId, status: 'streaming', type: 'status' });
      for await (const rawPart of streamSource.stream.fullStream) {
        const events = consumeConversationTaskPart(runtime.state, runtime.assistantMessageId, runtime.providerId, rawPart);
        if (events.length === 0) {
          continue;
        }
        await this.persistTaskSnapshot(runtime, 'streaming');
        this.emitAll(task, events);
      }
      const outcome: ConversationTaskOutcome = { status: task.abortController.signal.aborted ? 'stopped' : 'completed' };
      await this.finishTask(task, runtime, outcome);
    } catch (error) {
      await this.finishTask(task, runtime, await resolveConversationTaskOutcome(task.abortController.signal, runtime.resolveErrorMessage, error));
    } finally {
      unsubscribePermission();
    }
  }

  private async finishTask(
    task: ConversationTaskHandle,
    runtime: ConversationTaskRuntime,
    outcome: ConversationTaskOutcome,
  ): Promise<void> {
    const snapshot = await this.persistTaskSnapshot(runtime, outcome.status, 'error' in outcome ? outcome.error : null);
    if (outcome.status !== 'completed') {
      this.emitAll(task, [
        { ...('error' in outcome ? { error: outcome.error } : {}), messageId: runtime.assistantMessageId, status: outcome.status, type: 'status' },
        { messageId: runtime.assistantMessageId, status: outcome.status, type: 'finish' },
      ]);
      return;
    }
    const completed: CompletedConversationTaskResult = {
      assistantMessageId: runtime.assistantMessageId,
      conversationId: runtime.conversationId,
      ...snapshot,
    };
    const patched = await runtime.onComplete?.(completed);
    const finalResult = patched ?? completed;
    if (patched && hasPatchedResult(completed, patched)) {
      await this.runtimeHostConversationMessageService.writeMessage(
        runtime.conversationId,
        runtime.assistantMessageId,
        readConversationTaskMessageBody(patched, 'completed'),
      );
      this.emit(task, {
        content: patched.content,
        messageId: runtime.assistantMessageId,
        ...(patched.parts.length > 0 ? { parts: patched.parts } : {}),
        type: 'message-patch',
      });
    }
    this.emit(task, { messageId: runtime.assistantMessageId, status: 'completed', type: 'finish' });
    await runtime.onSent?.(finalResult);
  }

  private async persistTaskSnapshot(
    runtime: ConversationTaskRuntime,
    status: ChatMessageStatus,
    error: string | null = null,
  ): Promise<ConversationTaskSnapshot> {
    const snapshot: ConversationTaskSnapshot = {
      content: runtime.state.content.trim(),
      ...(runtime.state.metadata ? { metadata: finalizeCustomBlockMetadata(runtime.state.metadata, status) } : {}),
      modelId: runtime.modelId,
      parts: toAssistantParts(runtime.state.content),
      providerId: runtime.providerId,
      toolCalls: runtime.state.toolCalls.map((entry) => ({ ...entry })),
      toolResults: runtime.state.toolResults.map((entry) => ({ ...entry })),
    };
    await this.runtimeHostConversationMessageService.writeMessage(
      runtime.conversationId,
      runtime.assistantMessageId,
      readConversationTaskMessageBody(snapshot, status, error),
    );
    return snapshot;
  }

  private emit(task: ConversationTaskHandle, event: ConversationTaskEvent): void {
    for (const listener of task.listeners) { listener(event); }
  }

  private emitAll(task: ConversationTaskHandle, events: readonly ConversationTaskEvent[]): void {
    events.forEach((event) => this.emit(task, event));
  }
}

function readConversationTaskPermissionEvent(
  event: ConversationTaskPermissionEvent,
  assistantMessageId: string,
): ConversationTaskEvent {
  return event.type === 'request'
    ? {
        messageId: event.request.messageId ?? assistantMessageId,
        request: cloneJsonValue(event.request),
        type: 'permission-request',
      }
    : {
        messageId: event.messageId ?? assistantMessageId,
        result: cloneJsonValue(event.result),
        type: 'permission-resolved',
      };
}

async function resolveConversationTaskErrorMessage(
  resolver: StartConversationTaskInput['resolveErrorMessage'],
  error: unknown,
): Promise<string> {
  return await resolver?.(error) ?? (error instanceof Error ? error.message : 'Conversation generation failed');
}

async function resolveConversationTaskOutcome(
  abortSignal: AbortSignal,
  resolver: StartConversationTaskInput['resolveErrorMessage'],
  error: unknown,
): Promise<ConversationTaskOutcome> {
  return abortSignal.aborted ? { status: 'stopped' } : { error: await resolveConversationTaskErrorMessage(resolver, error), status: 'error' };
}

function readConversationTaskMessageBody(
  input: Pick<CompletedConversationTaskResult, 'content' | 'metadata' | 'modelId' | 'parts' | 'providerId' | 'toolCalls' | 'toolResults'>,
  status: ChatMessageStatus,
  error: string | null = null,
) {
  return {
    content: input.content,
    error,
    metadata: input.metadata,
    model: input.modelId,
    parts: input.parts,
    provider: input.providerId,
    status,
    toolCalls: input.toolCalls,
    toolResults: input.toolResults,
  };
}

function consumeConversationTaskPart(
  state: ConversationTaskState,
  messageId: string,
  providerId: string,
  rawPart: unknown,
): ConversationTaskEvent[] {
  const events = readConversationTaskMetadataEvents(state, messageId, providerId, readAssistantRawCustomBlocks(rawPart));
  const part = readAssistantStreamPart(rawPart);
  if (!part) {
    return events;
  }
  if (part.type === 'text-delta') {
    state.content += part.text;
    return [...events, { messageId, text: part.text, type: 'text-delta' }];
  }
  if (part.type === 'tool-call') {
    state.toolCalls.push({ input: part.input, toolCallId: part.toolCallId, toolName: part.toolName });
    return [...events, { input: part.input, messageId, toolName: part.toolName, type: 'tool-call' }];
  }
  state.toolResults.push({ output: part.output, toolCallId: part.toolCallId, toolName: part.toolName });
  return [...events, { messageId, output: part.output, toolName: part.toolName, type: 'tool-result' }];
}

function readConversationTaskMetadataEvents(
  state: ConversationTaskState,
  messageId: string,
  providerId: string,
  updates: ConversationTaskCustomBlockUpdate[],
): ConversationTaskEvent[] {
  const nextMetadata = applyCustomBlockUpdates(state.metadata, providerId, updates); if (nextMetadata === state.metadata) { return []; }
  state.metadata = nextMetadata;
  return nextMetadata ? [{ messageId, metadata: cloneJsonValue(nextMetadata), type: 'message-metadata' }] : [];
}

function applyCustomBlockUpdates(
  currentMetadata: ChatMessageMetadata | undefined,
  providerId: string,
  updates: ConversationTaskCustomBlockUpdate[],
): ChatMessageMetadata | undefined {
  if (updates.length === 0) {
    return currentMetadata;
  }
  const metadata = cloneJsonValue(currentMetadata ?? {}) as ChatMessageMetadata;
  const nextBlocks = [...(metadata.customBlocks ?? [])];
  let changed = false;
  for (const update of updates) {
    const blockId = `custom-field:${update.key}`;
    const blockIndex = nextBlocks.findIndex((entry) => entry.id === blockId);
    const nextBlock = readConversationTaskCustomBlock(nextBlocks[blockIndex], blockId, providerId, update);
    if (blockIndex < 0) {
      nextBlocks.push(nextBlock);
      changed = true;
      continue;
    }
    if (JSON.stringify(nextBlocks[blockIndex]) !== JSON.stringify(nextBlock)) {
      nextBlocks[blockIndex] = nextBlock;
      changed = true;
    }
  }
  return changed ? { ...metadata, customBlocks: nextBlocks } : currentMetadata;
}

function readConversationTaskCustomBlock(
  currentBlock: ChatMessageCustomBlock | undefined,
  blockId: string,
  providerId: string,
  update: ConversationTaskCustomBlockUpdate,
): ChatMessageCustomBlock {
  const source = { key: update.key, origin: 'ai-sdk.raw' as const, providerId };
  if (update.kind === 'text') {
    return {
      id: blockId,
      kind: 'text',
      source,
      state: 'streaming',
      text: `${currentBlock?.kind === 'text' ? currentBlock.text : ''}${update.value}`,
      title: formatCustomBlockTitle(update.key),
    };
  }
  return {
    data: cloneJsonValue(update.value),
    id: blockId,
    kind: 'json',
    source,
    state: 'streaming',
    title: formatCustomBlockTitle(update.key),
  };
}

function finalizeCustomBlockMetadata(
  metadata: ChatMessageMetadata | undefined,
  status: ChatMessageStatus,
): ChatMessageMetadata | undefined {
  if (!metadata?.customBlocks?.length || status === 'pending' || status === 'streaming') { return metadata; }
  return { ...metadata, customBlocks: metadata.customBlocks.map((block) => ({ ...block, state: 'done' })) };
}

function hasPatchedResult(
  original: CompletedConversationTaskResult,
  patched: CompletedConversationTaskResult,
): boolean {
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
  const text = content.trim(); return text ? [{ text, type: 'text' }] : [];
}
