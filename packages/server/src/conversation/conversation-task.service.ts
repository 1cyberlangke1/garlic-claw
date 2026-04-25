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
import {
  cloneJsonValue,
  readAssistantRawCustomBlocks,
  readAssistantStreamPart,
} from '../runtime/host/runtime-host-values';

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

type ConversationTaskMessageInput = Pick<
  StartConversationTaskInput,
  'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'
>;
type ConversationTaskCompletionInput = ConversationTaskMessageInput & Pick<StartConversationTaskInput, 'onComplete' | 'onSent'>;
type ConversationTaskStatus = Extract<ChatMessageStatus, 'completed' | 'error' | 'stopped'>;
type ConversationTaskPermissionEvent = Parameters<Parameters<RuntimeToolPermissionService['subscribe']>[1]>[0];
type ConversationTaskCustomBlockUpdate =
  | { key: string; kind: 'json'; value: JsonValue }
  | { key: string; kind: 'text'; value: string };

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
    const { handle, resolveCompletion } = createConversationTaskHandle();
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
    const state = createConversationTaskState();
    let resolvedInput: ConversationTaskCompletionInput = readConversationTaskMessageInput(input);
    const unsubscribePermission = this.runtimeToolPermissionService.subscribe(
      input.conversationId,
      (event) => this.emit(task, readConversationTaskPermissionEvent(event, input.assistantMessageId)),
    );
    try {
      const streamSource = await input.createStream(task.abortController.signal);
      resolvedInput = {
        ...input,
        modelId: streamSource.modelId,
        providerId: streamSource.providerId,
      };
      await this.writeTaskMessage(resolvedInput, state, 'streaming', null);
      this.emit(task, { messageId: input.assistantMessageId, status: 'streaming', type: 'status' });
      for await (const rawPart of streamSource.stream.fullStream) {
        const events = consumeConversationTaskPart(state, input.assistantMessageId, resolvedInput.providerId, rawPart);
        if (events.length === 0) {
          continue;
        }
        await this.writeTaskMessage(resolvedInput, state, 'streaming', null);
        this.emitAll(task, events);
      }
      await this.finalizeTask(
        task,
        resolvedInput,
        state,
        task.abortController.signal.aborted ? { status: 'stopped' } : { status: 'completed' },
      );
    } catch (error) {
      await this.finalizeTask(
        task,
        resolvedInput,
        state,
        task.abortController.signal.aborted
          ? { status: 'stopped' }
          : {
              error: await resolveConversationTaskErrorMessage(input.resolveErrorMessage, error),
              status: 'error',
            },
      );
    } finally {
      unsubscribePermission();
    }
  }

  private async finalizeTask(
    task: ConversationTaskHandle,
    input: ConversationTaskCompletionInput,
    state: ConversationTaskState,
    options: { error?: string; status: ConversationTaskStatus },
  ): Promise<void> {
    await this.writeTaskMessage(input, state, options.status, options.error ?? null);
    if (options.status !== 'completed') {
      this.emitAll(task, readConversationTaskTerminalEvents(input.assistantMessageId, options.status, options.error));
      return;
    }
    const completed = buildConversationTaskResult(input, state);
    const patched = await input.onComplete?.(completed);
    const finalResult = patched ?? completed;
    if (patched && hasPatchedResult(completed, patched)) {
      await this.runtimeHostConversationMessageService.writeMessage(
        input.conversationId,
        input.assistantMessageId,
        readConversationTaskPatchedMessage(patched),
      );
      this.emit(task, {
        content: patched.content,
        messageId: input.assistantMessageId,
        ...(patched.parts.length > 0 ? { parts: patched.parts } : {}),
        type: 'message-patch',
      });
    }
    this.emit(task, { messageId: input.assistantMessageId, status: 'completed', type: 'finish' });
    await input.onSent?.(finalResult);
  }

  private async writeTaskMessage(
    input: ConversationTaskMessageInput,
    state: ConversationTaskState,
    status: ChatMessageStatus,
    error: string | null,
  ): Promise<void> {
    await this.runtimeHostConversationMessageService.writeMessage(
      input.conversationId,
      input.assistantMessageId,
      readConversationTaskMessage(state, input, status, error),
    );
  }

  private emit(task: ConversationTaskHandle, event: ConversationTaskEvent): void {
    for (const listener of task.listeners) {
      listener(event);
    }
  }

  private emitAll(task: ConversationTaskHandle, events: readonly ConversationTaskEvent[]): void {
    events.forEach((event) => this.emit(task, event));
  }
}

function createConversationTaskHandle(): {
  handle: ConversationTaskHandle;
  resolveCompletion: () => void;
} {
  let resolveCompletion: () => void = () => undefined;
  return {
    handle: {
      abortController: new AbortController(),
      completion: new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      }),
      listeners: new Set(),
    },
    resolveCompletion,
  };
}

function createConversationTaskState(): ConversationTaskState {
  return { content: '', toolCalls: [], toolResults: [] };
}

function readConversationTaskMessageInput(input: ConversationTaskCompletionInput): ConversationTaskCompletionInput {
  return {
    assistantMessageId: input.assistantMessageId,
    conversationId: input.conversationId,
    modelId: input.modelId,
    onComplete: input.onComplete,
    onSent: input.onSent,
    providerId: input.providerId,
  };
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

function readConversationTaskTerminalEvents(
  messageId: string,
  status: Exclude<ConversationTaskStatus, 'completed'>,
  error?: string,
): ConversationTaskEvent[] {
  return [
    { ...(error ? { error } : {}), messageId, status, type: 'status' },
    { messageId, status, type: 'finish' },
  ];
}

function readConversationTaskMessage(
  state: ConversationTaskState,
  input: ConversationTaskMessageInput,
  status: ChatMessageStatus,
  error: string | null,
) {
  return {
    content: state.content,
    error,
    metadata: finalizeCustomBlockMetadata(state.metadata, status),
    model: input.modelId,
    parts: toAssistantParts(state.content),
    provider: input.providerId,
    status,
    toolCalls: state.toolCalls,
    toolResults: state.toolResults,
  };
}

function readConversationTaskPatchedMessage(result: CompletedConversationTaskResult) {
  return {
    content: result.content,
    metadata: result.metadata,
    model: result.modelId,
    parts: result.parts,
    provider: result.providerId,
    status: 'completed' as const,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
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
  const nextMetadata = applyCustomBlockUpdates(state.metadata, providerId, updates);
  if (nextMetadata === state.metadata) {
    return [];
  }
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

function buildConversationTaskResult(
  input: ConversationTaskMessageInput,
  state: ConversationTaskState,
): CompletedConversationTaskResult {
  return {
    assistantMessageId: input.assistantMessageId,
    content: state.content.trim(),
    conversationId: input.conversationId,
    ...(state.metadata ? { metadata: finalizeCustomBlockMetadata(state.metadata, 'completed') } : {}),
    modelId: input.modelId,
    parts: toAssistantParts(state.content),
    providerId: input.providerId,
    toolCalls: state.toolCalls.map((entry) => ({ ...entry })),
    toolResults: state.toolResults.map((entry) => ({ ...entry })),
  };
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
  if (!metadata?.customBlocks?.length || status === 'pending' || status === 'streaming') {
    return metadata;
  }
  return {
    ...metadata,
    customBlocks: metadata.customBlocks.map((block) => ({ ...block, state: 'done' })),
  };
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
  const normalized = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized
    ? normalized.split(' ').map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ')
    : key;
}

function toAssistantParts(content: string): ChatMessagePart[] {
  const text = content.trim();
  return text ? [{ text, type: 'text' }] : [];
}
