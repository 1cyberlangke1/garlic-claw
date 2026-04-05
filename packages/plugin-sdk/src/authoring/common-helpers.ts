import type { JsonObject, JsonValue } from '@garlic-claw/shared';

export function sanitizeOptionalText(value?: string): string {
  return (value ?? '').trim();
}

export function readJsonObjectValue(
  value: unknown,
): Record<string, JsonValue> | null {
  return isJsonObjectValue(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

export function readRequiredStringParam(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} 必填`);
  }

  return value;
}

export function readOptionalStringParam(
  params: JsonObject,
  key: string,
): string | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} 必须是字符串`);
  }

  return value;
}

export function readOptionalObjectParam(
  params: JsonObject,
  key: string,
): JsonObject | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const object = readJsonObjectValue(value);
  if (!object) {
    throw new Error(`${key} 必须是对象`);
  }

  return object;
}

export function readRequiredTextValue(value: JsonValue, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} 必须是非空字符串`);
  }

  return value.trim();
}

export function readBooleanFlag(value: JsonValue, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

export function parseCommaSeparatedNames(raw?: string): string[] | undefined {
  const normalized = sanitizeOptionalText(raw);
  if (!normalized) {
    return undefined;
  }

  const names = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

export function textIncludesKeyword(text: string, keyword?: string): boolean {
  const normalizedKeyword = sanitizeOptionalText(keyword);
  return Boolean(normalizedKeyword) && text.includes(normalizedKeyword);
}

function isJsonValue(value: unknown): value is JsonValue {
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

  return isJsonObjectValue(value);
}

function isJsonObjectValue(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isJsonValue(entry));
}
