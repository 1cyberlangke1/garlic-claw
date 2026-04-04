import type { PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject } from '../common/types/json-value';
import {
  readOptionalNumberValue,
  readOptionalObjectValue,
  readOptionalStringRecordValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';

function throwHostBadRequest(error: unknown): never {
  throw new BadRequestException(String((error as Error).message));
}

export function readHostString(params: JsonObject, key: string): string | null {
  try {
    return readOptionalStringValue(params[key], key) ?? null;
  } catch (error) {
    return throwHostBadRequest(error);
  }
}

export function requireHostString(params: JsonObject, key: string): string {
  const value = readHostString(params, key);
  if (value === null) {
    throw new BadRequestException(`${key} 必填`);
  }

  return value;
}

export function readHostNumber(params: JsonObject, key: string): number | null {
  try {
    return readOptionalNumberValue(params[key], key) ?? null;
  } catch (error) {
    return throwHostBadRequest(error);
  }
}

export function readHostObject(
  params: JsonObject,
  key: string,
): JsonObject | null {
  try {
    return readOptionalObjectValue(params[key], key) ?? null;
  } catch (error) {
    return throwHostBadRequest(error);
  }
}

export function readHostStringRecord(
  params: JsonObject,
  key: string,
): Record<string, string> | null {
  try {
    return readOptionalStringRecordValue(params[key], key) ?? null;
  } catch (error) {
    return throwHostBadRequest(error);
  }
}

export function requireHostConversationId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.conversationId) {
    throw new BadRequestException(`${method} 需要 conversationId 上下文`);
  }

  return context.conversationId;
}

export function requireHostUserId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.userId) {
    throw new BadRequestException(`${method} 需要 userId 上下文`);
  }

  return context.userId;
}
