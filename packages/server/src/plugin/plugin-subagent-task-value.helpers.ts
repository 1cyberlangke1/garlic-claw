import type { PluginMessageTargetInfo } from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';

export function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

export function parseUnknownJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readPluginMessageTargetInfoValue(
  value: unknown,
): PluginMessageTargetInfo | null {
  if (!isJsonObjectValue(value) || value.type !== 'conversation' || typeof value.id !== 'string') {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
  };
}

export function isJsonObjectValue(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isJsonValue(entry));
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((entry) => isJsonValue(entry));
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isJsonObjectValue(value)
    && Object.values(value).every((entry) => typeof entry === 'string');
}
