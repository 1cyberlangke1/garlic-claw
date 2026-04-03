import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import {
  readOptionalBooleanValue,
  readOptionalNumberValue,
  readOptionalObjectValue,
  readOptionalStringArrayValue,
  readOptionalStringRecordValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';
import { readJsonObjectValue } from './plugin-llm-payload.helpers';

export function requireRuntimeString(
  params: JsonObject,
  key: string,
  method: string,
): string {
  const value = params[key];
  if (typeof value === 'string') {
    return value;
  }

  throw new BadRequestException(`${method} 的 ${key} 必须是字符串`);
}

export function readOptionalRuntimeString(
  params: JsonObject,
  key: string,
  method: string,
): string | undefined {
  try {
    return readOptionalStringValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readOptionalRuntimeBoolean(
  params: JsonObject,
  key: string,
  method: string,
): boolean | undefined {
  try {
    return readOptionalBooleanValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readOptionalRuntimeNumber(
  params: JsonObject,
  key: string,
  method: string,
): number | undefined {
  try {
    return readOptionalNumberValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function requirePositiveRuntimeNumber(
  params: JsonObject,
  key: string,
  method: string,
): number {
  const value = readOptionalRuntimeNumber(params, key, method);
  if (typeof value !== 'number' || value <= 0) {
    throw new BadRequestException(`${method} 的 ${key} 必须是正数`);
  }

  return value;
}

export function readOptionalRuntimeObject(
  params: JsonObject,
  key: string,
  method: string,
): JsonObject | undefined {
  try {
    return readOptionalObjectValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readOptionalRuntimeStringArray(
  params: JsonObject,
  key: string,
  method: string,
): string[] | undefined {
  try {
    return readOptionalStringArrayValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readOptionalRuntimeStringRecord(
  params: JsonObject,
  key: string,
  method: string,
): Record<string, string> | undefined {
  try {
    return readOptionalStringRecordValue(params[key], `${method} 的 ${key}`);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readOptionalRuntimeJsonValue(
  params: JsonObject,
  key: string,
): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(params, key)
    ? params[key]
    : undefined;
}

export function requireRuntimeJsonObjectValue(
  value: JsonValue,
  label: string,
): JsonObject {
  try {
    return readJsonObjectValue(value, label);
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}
