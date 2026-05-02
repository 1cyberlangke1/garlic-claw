import type { JsonValue } from '@garlic-claw/shared';

export type InvalidToolPhase = 'execute' | 'resolve' | 'validate';

export interface InvalidToolPayload {
  tool: string;
  phase: InvalidToolPhase;
  error: string;
  inputText?: string;
}

export interface InvalidToolResult extends InvalidToolPayload {
  recovered: true;
  type: 'invalid-tool-result';
}

export function createInvalidToolResult(input: InvalidToolPayload): InvalidToolResult {
  return {
    error: input.error.trim() || '未知工具错误',
    ...(input.inputText?.trim() ? { inputText: input.inputText.trim() } : {}),
    phase: input.phase,
    recovered: true,
    tool: input.tool.trim() || 'unknown-tool',
    type: 'invalid-tool-result',
  };
}

export function isInvalidToolResult(value: unknown): value is InvalidToolResult {
  if (!isRecord(value)) {
    return false;
  }
  return value.type === 'invalid-tool-result'
    && value.recovered === true
    && typeof value.tool === 'string'
    && typeof value.phase === 'string'
    && typeof value.error === 'string';
}

export function stringifyInvalidToolInput(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (isJsonValue(value)) {
    return JSON.stringify(value, null, 2);
  }
  return undefined;
}

function isJsonArray(value: unknown): value is JsonValue[] {
  return Array.isArray(value) && value.every((entry) => isJsonValue(entry));
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
    || isJsonArray(value)
    || isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
