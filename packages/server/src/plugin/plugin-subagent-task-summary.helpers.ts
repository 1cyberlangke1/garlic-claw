import type {
  PluginMessageTargetInfo,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskSummary,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { parseTaskContext, parseTaskRequest } from './plugin-subagent-task-request.helpers';
import {
  parseTaskResult,
  parseWriteBackTarget,
} from './plugin-subagent-task-result.helpers';
import { readPluginMessageTargetInfoValue } from './plugin-subagent-task-value.helpers';
import type { PersistedPluginSubagentTaskRecord } from './plugin-subagent-task.types';

export function readPluginMessageSendSummary(value: JsonValue): {
  id: string;
  target: PluginMessageTargetInfo;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('message.send 返回值必须是对象');
  }

  if (typeof value.id !== 'string') {
    throw new Error('message.send 返回值缺少合法 id');
  }

  return {
    id: value.id,
    target: readPluginMessageTargetInfoValue(value.target)
      ?? (() => {
        throw new Error('message.send 返回值中的 target 不合法');
      })(),
  };
}

export function serializePluginSubagentTaskSummary(
  record: PersistedPluginSubagentTaskRecord,
): PluginSubagentTaskSummary {
  const request = parseTaskRequest(record.requestJson);
  const result = parseTaskResult(record.resultJson);
  const writeBackTarget = parseWriteBackTarget(record.writeBackTargetJson);

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

export function serializePluginSubagentTaskDetail(
  record: PersistedPluginSubagentTaskRecord,
): PluginSubagentTaskDetail {
  const request = parseTaskRequest(record.requestJson);
  const context = parseTaskContext(record.contextJson);
  const result = parseTaskResult(record.resultJson);

  return {
    ...serializePluginSubagentTaskSummary(record),
    request,
    context,
    ...(result ? { result } : {}),
  };
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
