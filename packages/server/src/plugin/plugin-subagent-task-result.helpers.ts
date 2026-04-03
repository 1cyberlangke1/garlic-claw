import type {
  PluginMessageTargetInfo,
  PluginSubagentRunResult,
} from '@garlic-claw/shared';
import { toJsonValue } from '../common/utils/json-value';
import {
  isJsonObjectValue,
  parseUnknownJson,
  readPluginMessageTargetInfoValue,
} from './plugin-subagent-task-value.helpers';

export function parseTaskResult(raw: string | null): PluginSubagentRunResult | null {
  if (!raw) {
    return null;
  }

  return readPluginSubagentRunResult(parseUnknownJson(raw));
}

export function parseWriteBackTarget(raw: string | null): PluginMessageTargetInfo | null {
  if (!raw) {
    return null;
  }

  return readPluginMessageTargetInfoValue(parseUnknownJson(raw));
}

function readPluginSubagentRunResult(value: unknown): PluginSubagentRunResult | null {
  if (
    !isJsonObjectValue(value)
    || typeof value.providerId !== 'string'
    || typeof value.modelId !== 'string'
    || typeof value.text !== 'string'
  ) {
    return null;
  }

  const message = readAssistantMessage(value.message);
  const toolCalls = readPluginSubagentToolCalls(value.toolCalls);
  const toolResults = readPluginSubagentToolResults(value.toolResults);
  if (!message || !toolCalls || !toolResults) {
    return null;
  }
  if (
    'finishReason' in value
    && value.finishReason !== undefined
    && value.finishReason !== null
    && typeof value.finishReason !== 'string'
  ) {
    return null;
  }

  return {
    providerId: value.providerId,
    modelId: value.modelId,
    text: value.text,
    message,
    ...(Object.prototype.hasOwnProperty.call(value, 'finishReason')
      ? { finishReason: value.finishReason as string | null | undefined }
      : {}),
    toolCalls,
    toolResults,
  };
}

function readAssistantMessage(
  value: unknown,
): PluginSubagentRunResult['message'] | null {
  if (!isJsonObjectValue(value) || value.role !== 'assistant' || typeof value.content !== 'string') {
    return null;
  }

  return {
    role: 'assistant',
    content: value.content,
  };
}

function readPluginSubagentToolCalls(
  value: unknown,
): PluginSubagentRunResult['toolCalls'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const toolCalls: PluginSubagentRunResult['toolCalls'] = [];
  for (const entry of value) {
    if (
      !isJsonObjectValue(entry)
      || typeof entry.toolCallId !== 'string'
      || typeof entry.toolName !== 'string'
      || !('input' in entry)
    ) {
      return null;
    }

    toolCalls.push({
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      input: toJsonValue(entry.input),
    });
  }

  return toolCalls;
}

function readPluginSubagentToolResults(
  value: unknown,
): PluginSubagentRunResult['toolResults'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const toolResults: PluginSubagentRunResult['toolResults'] = [];
  for (const entry of value) {
    if (
      !isJsonObjectValue(entry)
      || typeof entry.toolCallId !== 'string'
      || typeof entry.toolName !== 'string'
      || !('output' in entry)
    ) {
      return null;
    }

    toolResults.push({
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      output: toJsonValue(entry.output),
    });
  }

  return toolResults;
}
