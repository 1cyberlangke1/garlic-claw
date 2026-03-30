import type {
  PluginCallContext,
  PluginMessageSendInfo,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
  PluginSubagentTaskSummary,
  PluginSubagentTaskWriteBackStatus,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRuntimeService } from './plugin-runtime.service';

interface PersistedPluginSubagentTaskRecord {
  id: string;
  pluginId: string;
  pluginDisplayName: string | null;
  runtimeKind: string;
  userId: string | null;
  conversationId: string | null;
  status: string;
  requestJson: string;
  contextJson: string;
  resultJson: string | null;
  error: string | null;
  providerId: string | null;
  modelId: string | null;
  writeBackTargetJson: string | null;
  writeBackStatus: string;
  writeBackError: string | null;
  writeBackMessageId: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PluginSubagentTaskModelDelegate {
  create(input: {
    data: Record<string, unknown>;
  }): Promise<PersistedPluginSubagentTaskRecord>;
  update(input: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<PersistedPluginSubagentTaskRecord>;
  findMany(input: {
    orderBy: Array<Record<string, 'asc' | 'desc'>>;
  }): Promise<PersistedPluginSubagentTaskRecord[]>;
  findUnique(input: {
    where: { id: string };
  }): Promise<PersistedPluginSubagentTaskRecord | null>;
}

export interface StartPluginSubagentTaskInput {
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  context: PluginCallContext;
  request: PluginSubagentRequest;
  writeBackTarget?: PluginMessageTargetRef | null;
}

@Injectable()
export class PluginSubagentTaskService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
  ) {}

  async startTask(input: StartPluginSubagentTaskInput): Promise<PluginSubagentTaskSummary> {
    const requestedAt = new Date();
    const record = await this.getTaskModel().create({
      data: {
        pluginId: input.pluginId,
        pluginDisplayName: input.pluginDisplayName ?? null,
        runtimeKind: input.runtimeKind,
        userId: input.context.userId ?? null,
        conversationId: input.context.conversationId ?? null,
        status: 'queued',
        requestJson: JSON.stringify(cloneJsonValue(input.request)),
        contextJson: JSON.stringify(cloneJsonValue(input.context)),
        providerId: input.request.providerId ?? null,
        modelId: input.request.modelId ?? null,
        writeBackTargetJson: input.writeBackTarget
          ? JSON.stringify(cloneJsonValue(input.writeBackTarget))
          : null,
        writeBackStatus: input.writeBackTarget ? 'pending' : 'skipped',
        requestedAt,
      },
    });

    setTimeout(() => {
      void this.runTask({
        taskId: record.id,
        pluginId: input.pluginId,
        context: cloneJsonValue(input.context),
        request: cloneJsonValue(input.request),
        writeBackTarget: input.writeBackTarget
          ? cloneJsonValue(input.writeBackTarget)
          : null,
      });
    }, 0);

    return this.serializeTaskSummary(record);
  }

  async listOverview(): Promise<PluginSubagentTaskOverview> {
    const records = await this.getTaskModel().findMany({
      orderBy: [
        {
          requestedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    });

    return {
      tasks: records.map((record) => this.serializeTaskSummary(record)),
    };
  }

  async listTasksForPlugin(pluginId: string): Promise<PluginSubagentTaskSummary[]> {
    const overview = await this.listOverview();
    return overview.tasks.filter(
      (task: PluginSubagentTaskSummary) => task.pluginId === pluginId,
    );
  }

  async getTaskOrThrow(taskId: string): Promise<PluginSubagentTaskDetail> {
    const record = await this.getTaskModel().findUnique({
      where: {
        id: taskId,
      },
    });
    if (!record) {
      throw new NotFoundException(`Plugin subagent task not found: ${taskId}`);
    }

    return this.serializeTaskDetail(record);
  }

  async getTaskForPlugin(pluginId: string, taskId: string): Promise<PluginSubagentTaskDetail> {
    const task = await this.getTaskOrThrow(taskId);
    if (task.pluginId !== pluginId) {
      throw new NotFoundException(`Plugin subagent task not found: ${taskId}`);
    }

    return task;
  }

  private async runTask(input: {
    taskId: string;
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
    writeBackTarget: PluginMessageTargetRef | null;
  }): Promise<void> {
    await this.getTaskModel().update({
      where: {
        id: input.taskId,
      },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      const result = await this.pluginRuntime.executeSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: input.request,
      });
      const writeBack = await this.writeBackResultIfNeeded({
        pluginId: input.pluginId,
        context: input.context,
        target: input.writeBackTarget,
        result,
      });

      await this.getTaskModel().update({
        where: {
          id: input.taskId,
        },
        data: {
          status: 'completed',
          resultJson: JSON.stringify(cloneJsonValue(result)),
          error: null,
          providerId: result.providerId,
          modelId: result.modelId,
          writeBackTargetJson: writeBack.target
            ? JSON.stringify(cloneJsonValue(writeBack.target))
            : input.writeBackTarget
              ? JSON.stringify(cloneJsonValue(input.writeBackTarget))
              : null,
          writeBackStatus: writeBack.status,
          writeBackError: writeBack.error,
          writeBackMessageId: writeBack.messageId,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await this.getTaskModel().update({
        where: {
          id: input.taskId,
        },
        data: {
          status: 'error',
          error: toErrorMessage(error, '后台子代理任务执行失败'),
          writeBackStatus: 'skipped',
          writeBackError: null,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async writeBackResultIfNeeded(input: {
    pluginId: string;
    context: PluginCallContext;
    target: PluginMessageTargetRef | null;
    result: PluginSubagentRunResult;
  }): Promise<{
    status: PluginSubagentTaskWriteBackStatus;
    target?: PluginMessageTargetInfo | null;
    messageId?: string | null;
    error?: string | null;
  }> {
    if (!input.target) {
      return {
        status: 'skipped',
      };
    }

    try {
      const sent = await this.pluginRuntime.callHost({
        pluginId: input.pluginId,
        context: input.context,
        method: 'message.send',
        params: {
          target: input.target as never,
          content: input.result.text,
          provider: input.result.providerId,
          model: input.result.modelId,
        },
      }) as unknown as PluginMessageSendInfo;

      return {
        status: 'sent',
        target: sent.target,
        messageId: sent.id,
        error: null,
      };
    } catch (error) {
      return {
        status: 'failed',
        target: input.target,
        messageId: null,
        error: toErrorMessage(error, '后台子代理结果回写失败'),
      };
    }
  }

  private serializeTaskSummary(
    record: PersistedPluginSubagentTaskRecord,
  ): PluginSubagentTaskSummary {
    const request = parseTaskRequest(record.requestJson);
    const result = parseTaskResult(record.resultJson);
    const writeBackTarget = parseNullableJsonValue<PluginMessageTargetInfo>(
      record.writeBackTargetJson,
    );

    return {
      id: record.id,
      pluginId: record.pluginId,
      ...(record.pluginDisplayName ? { pluginDisplayName: record.pluginDisplayName } : {}),
      runtimeKind: record.runtimeKind === 'builtin' ? 'builtin' : 'remote',
      status: normalizeTaskStatus(record.status),
      requestPreview: buildRequestPreview(request),
      ...(result ? { resultPreview: buildResultPreview(result) } : {}),
      ...(record.providerId ? { providerId: record.providerId } : {}),
      ...(record.modelId ? { modelId: record.modelId } : {}),
      ...(record.error ? { error: record.error } : {}),
      writeBackStatus: normalizeWriteBackStatus(record.writeBackStatus),
      ...(writeBackTarget ? { writeBackTarget } : {}),
      ...(record.writeBackError ? { writeBackError: record.writeBackError } : {}),
      ...(record.writeBackMessageId ? { writeBackMessageId: record.writeBackMessageId } : {}),
      requestedAt: record.requestedAt.toISOString(),
      startedAt: record.startedAt ? record.startedAt.toISOString() : null,
      finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
      ...(record.conversationId ? { conversationId: record.conversationId } : {}),
      ...(record.userId ? { userId: record.userId } : {}),
    };
  }

  private serializeTaskDetail(
    record: PersistedPluginSubagentTaskRecord,
  ): PluginSubagentTaskDetail {
    const request = parseTaskRequest(record.requestJson);
    const context = parseTaskContext(record.contextJson);
    const result = parseTaskResult(record.resultJson);

    return {
      ...this.serializeTaskSummary(record),
      request,
      context,
      ...(result ? { result } : {}),
    };
  }

  private getTaskModel(): PluginSubagentTaskModelDelegate {
    return (this.prisma as unknown as {
      pluginSubagentTask: PluginSubagentTaskModelDelegate;
    }).pluginSubagentTask;
  }
}

function parseTaskRequest(raw: string): PluginSubagentRequest {
  return parseJsonValue<PluginSubagentRequest>(raw, {
    messages: [],
    maxSteps: 4,
  });
}

function parseTaskContext(raw: string): PluginCallContext {
  return parseJsonValue<PluginCallContext>(raw, {
    source: 'plugin',
  });
}

function parseTaskResult(raw: string | null): PluginSubagentRunResult | null {
  if (!raw) {
    return null;
  }

  return parseJsonValue<PluginSubagentRunResult | null>(raw, null);
}

function parseNullableJsonValue<T>(raw: string | null): T | null {
  if (!raw) {
    return null;
  }

  return parseJsonValue<T | null>(raw, null);
}

function parseJsonValue<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildRequestPreview(request: PluginSubagentRequest): string {
  const text = request.messages
    .flatMap((message) => extractMessageText(message.content))
    .join(' ')
    .trim();

  if (text) {
    return truncateText(text, 80);
  }
  if (request.messages.some((message) => hasImageContent(message.content))) {
    return '包含图片输入的后台子代理任务';
  }

  return '空后台子代理任务';
}

function buildResultPreview(result: PluginSubagentRunResult): string {
  return truncateText(result.text.trim() || result.message.content.trim(), 80);
}

function extractMessageText(content: PluginSubagentRequest['messages'][number]['content']): string[] {
  if (typeof content === 'string') {
    return content.trim() ? [content.trim()] : [];
  }

  return content
    .filter((part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);
}

function hasImageContent(content: PluginSubagentRequest['messages'][number]['content']): boolean {
  return Array.isArray(content) && content.some((part) => part.type === 'image');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function normalizeTaskStatus(status: string): PluginSubagentTaskSummary['status'] {
  if (
    status === 'queued'
    || status === 'running'
    || status === 'completed'
    || status === 'error'
  ) {
    return status;
  }

  return 'error';
}

function normalizeWriteBackStatus(
  status: string,
): PluginSubagentTaskSummary['writeBackStatus'] {
  if (
    status === 'pending'
    || status === 'sent'
    || status === 'failed'
    || status === 'skipped'
  ) {
    return status;
  }

  return 'skipped';
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
