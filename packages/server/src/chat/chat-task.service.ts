import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ChatMessagePart,
  type ChatTaskEvent,
  type ChatTaskStreamPart,
  type ChatTaskStreamSource,
  type PersistedToolCall,
  type PersistedToolResult,
  isTextDeltaPart,
  isToolCallPart,
  isToolResultPart,
} from './chat.types';
import {
  ChatTaskPersistenceService,
  type ChatTaskMutableState,
} from './chat-task-persistence.service';

export interface StartChatTaskInput {
  assistantMessageId: string;
  conversationId: string;
  providerId: string;
  modelId: string;
  createStream: (abortSignal: AbortSignal) => ResolvedChatTaskStreamSource;
  onComplete?: (
    result: CompletedChatTaskResult,
  ) => Promise<CompletedChatTaskResult | void> | CompletedChatTaskResult | void;
  onSent?: (
    result: CompletedChatTaskResult,
  ) => Promise<void> | void;
}

export interface CompletedChatTaskResult {
  assistantMessageId: string;
  conversationId: string;
  providerId: string;
  modelId: string;
  content: string;
  parts: ChatMessagePart[];
  toolCalls: PersistedToolCall[];
  toolResults: PersistedToolResult[];
}

type ChatTaskSubscriber = (event: ChatTaskEvent) => void;
type TerminalTaskStatus = 'completed' | 'stopped' | 'error';

interface ActiveChatTask {
  abortController: AbortController;
  subscribers: Set<ChatTaskSubscriber>;
  completion: Promise<void>;
}

interface ResolvedChatTaskStreamSource {
  providerId: string;
  modelId: string;
  stream: ChatTaskStreamSource;
}

@Injectable()
export class ChatTaskService implements OnModuleInit {
  private readonly logger = new Logger(ChatTaskService.name);
  private readonly tasks = new Map<string, ActiveChatTask>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskPersistence: ChatTaskPersistenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.message.updateMany({
      where: {
        role: 'assistant',
        status: {
          in: ['pending', 'streaming'],
        },
      },
      data: {
        status: 'error',
        error: '服务已重启，本次生成已中断',
      },
    });
  }

  startTask(input: StartChatTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {
      throw new Error(`Chat task already exists for message ${input.assistantMessageId}`);
    }

    const task: ActiveChatTask = {
      abortController: new AbortController(),
      subscribers: new Set<ChatTaskSubscriber>(),
      completion: Promise.resolve(),
    };

    task.completion = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void this.runTask(task, input)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.tasks.delete(input.assistantMessageId);
          });
      }, 0);
    });
    this.tasks.set(input.assistantMessageId, task);
  }

  subscribe(messageId: string, subscriber: ChatTaskSubscriber): () => void {
    const task = this.tasks.get(messageId);
    if (!task) {
      return () => undefined;
    }

    task.subscribers.add(subscriber);
    return () => {
      task.subscribers.delete(subscriber);
    };
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

  hasActiveTask(messageId: string): boolean {
    return this.tasks.has(messageId);
  }

  private async runTask(
    task: ActiveChatTask,
    input: StartChatTaskInput,
  ): Promise<void> {
    const state: ChatTaskMutableState = {
      content: '',
      toolCalls: [],
      toolResults: [],
    };
    let resolvedInput = input;

    try {
      const streamSource = input.createStream(task.abortController.signal);
      resolvedInput = {
        ...input,
        providerId: streamSource.providerId,
        modelId: streamSource.modelId,
      };
      await this.taskPersistence.persistMessageState(resolvedInput, state, 'streaming', null);
      this.emit(task, {
        type: 'status',
        messageId: input.assistantMessageId,
        status: 'streaming',
      });

      for await (const part of streamSource.stream.fullStream) {
        const streamEvent = await this.applyStreamPart(
          resolvedInput,
          state,
          input.assistantMessageId,
          part,
        );
        if (streamEvent) {
          this.emit(task, streamEvent);
        }
      }

      if (task.abortController.signal.aborted) {
        await this.finishTerminalTask(
          task,
          input.assistantMessageId,
          resolvedInput,
          state,
          'stopped',
        );
        return;
      }

      await this.finishCompletedTask(task, input, resolvedInput, state);
    } catch (error) {
      if (task.abortController.signal.aborted) {
        await this.finishTerminalTask(
          task,
          input.assistantMessageId,
          resolvedInput,
          state,
          'stopped',
        );
        return;
      }

      const errorMessage = toErrorMessage(error);
      this.logger.error(
        `聊天任务执行失败: ${input.assistantMessageId} - ${errorMessage}`,
      );
      await this.finishTerminalTask(
        task,
        input.assistantMessageId,
        resolvedInput,
        state,
        'error',
        errorMessage,
      );
    }
  }

  private async applyStreamPart(
    input: StartChatTaskInput,
    state: ChatTaskMutableState,
    messageId: string,
    part: ChatTaskStreamPart,
  ): Promise<ChatTaskEvent | null> {
    if (isTextDeltaPart(part)) {
      return this.persistStreamingPart(input, state, () => {
        state.content += part.text;
        return { type: 'text-delta', messageId, text: part.text };
      });
    }

    if (isToolCallPart(part)) {
      return this.persistStreamingPart(input, state, () => {
        state.toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
        return {
          type: 'tool-call',
          messageId,
          toolName: part.toolName,
          input: part.input,
        };
      });
    }

    if (isToolResultPart(part)) {
      return this.persistStreamingPart(input, state, () => {
        state.toolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        });
        return {
          type: 'tool-result',
          messageId,
          toolName: part.toolName,
          output: part.output,
        };
      });
    }

    return null;
  }

  private async persistStreamingPart(
    input: StartChatTaskInput,
    state: ChatTaskMutableState,
    buildEvent: () => ChatTaskEvent,
  ): Promise<ChatTaskEvent> {
    const event = buildEvent();
    await this.taskPersistence.persistMessageState(input, state, 'streaming', null);
    return event;
  }

  private async finishCompletedTask(
    task: ActiveChatTask,
    input: StartChatTaskInput,
    resolvedInput: StartChatTaskInput,
    state: ChatTaskMutableState,
  ): Promise<void> {
    await this.taskPersistence.persistMessageState(resolvedInput, state, 'completed', null);
    const completedResult = this.taskPersistence.buildCompletedTaskResult(resolvedInput, state);
    const patchedResult = await this.runTaskCallback(
      input.assistantMessageId,
      '聊天完成回调执行失败',
      input.onComplete ? () => input.onComplete?.(completedResult) : undefined,
    );
    const finalResult = patchedResult ?? completedResult;
    if (
      patchedResult
      && this.taskPersistence.hasCompletedResultPatch(completedResult, patchedResult)
    ) {
      await this.taskPersistence.persistCompletedResult(patchedResult);
      this.emit(task, {
        type: 'message-patch',
        messageId: patchedResult.assistantMessageId,
        content: patchedResult.content,
        ...(patchedResult.parts.length > 0 ? { parts: patchedResult.parts } : {}),
      });
    }
    this.emitTerminalTaskEvent(task, input.assistantMessageId, 'completed');
    await this.runTaskCallback(
      input.assistantMessageId,
      '聊天发送后回调执行失败',
      input.onSent ? () => input.onSent?.(finalResult) : undefined,
    );
  }

  private async finishTerminalTask(
    task: ActiveChatTask,
    messageId: string,
    input: StartChatTaskInput,
    state: ChatTaskMutableState,
    status: Exclude<TerminalTaskStatus, 'completed'>,
    error: string | null = null,
  ): Promise<void> {
    await this.taskPersistence.persistMessageState(input, state, status, error);
    this.emitTerminalTaskEvent(task, messageId, status, error ?? undefined);
  }

  private emitTerminalTaskEvent(
    task: ActiveChatTask,
    messageId: string,
    status: TerminalTaskStatus,
    error?: string,
  ): void {
    if (status !== 'completed') {
      this.emit(task, {
        type: 'status',
        messageId,
        status,
        ...(error ? { error } : {}),
      });
    }
    this.emit(task, { type: 'finish', messageId, status });
  }

  private async runTaskCallback<TResult>(
    messageId: string,
    failureLabel: string,
    callback?: () => Promise<TResult | void> | TResult | void,
  ): Promise<TResult | undefined> {
    if (!callback) {
      return undefined;
    }
    try {
      return await callback() as TResult | undefined;
    } catch (error) {
      this.logger.warn(`${failureLabel}: ${messageId} - ${toErrorMessage(error)}`);
      return undefined;
    }
  }

  private emit(task: ActiveChatTask, event: ChatTaskEvent): void {
    for (const subscriber of task.subscribers) {
      subscriber(event);
    }
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
