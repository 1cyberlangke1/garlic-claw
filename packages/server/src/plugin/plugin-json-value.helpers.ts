import type { JsonObject, JsonValue } from '../common/types/json-value';
import { readJsonObjectValue } from './plugin-llm-payload.helpers';

/**
 * 读取可选字符串值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 字符串；缺失时返回 undefined
 */
export function readOptionalStringValue(
  value: JsonValue | undefined,
  label: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }

  throw new Error(`${label} 必须是字符串`);
}

/**
 * 读取可选布尔值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 布尔值；缺失时返回 undefined
 */
export function readOptionalBooleanValue(
  value: JsonValue | undefined,
  label: string,
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  throw new Error(`${label} 必须是布尔值`);
}

/**
 * 读取可选数字值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 数字；缺失时返回 undefined
 */
export function readOptionalNumberValue(
  value: JsonValue | undefined,
  label: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }

  throw new Error(`${label} 必须是数字`);
}

/**
 * 读取可选对象值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns JSON 对象；缺失时返回 undefined
 */
export function readOptionalObjectValue(
  value: JsonValue | undefined,
  label: string,
): JsonObject | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readJsonObjectValue(value, label);
}

/**
 * 读取可选字符串数组值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 字符串数组；缺失时返回 undefined
 */
export function readOptionalStringArrayValue(
  value: JsonValue | undefined,
  label: string,
): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }

  throw new Error(`${label} 必须是字符串数组`);
}

/**
 * 读取可选字符串字典值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 字符串字典；缺失时返回 undefined
 */
export function readOptionalStringRecordValue(
  value: JsonValue | undefined,
  label: string,
): Record<string, string> | undefined {
  const objectValue = readOptionalObjectValue(value, label);
  if (!objectValue) {
    return undefined;
  }

  const record: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(objectValue)) {
    if (typeof entryValue !== 'string') {
      throw new Error(`${label}.${entryKey} 必须是字符串`);
    }
    record[entryKey] = entryValue;
  }

  return record;
}
