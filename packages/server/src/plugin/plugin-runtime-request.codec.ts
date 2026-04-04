import {
  readRuntimeConversationSessionCall as readSharedRuntimeConversationSessionCall,
  readRuntimeMessageSendInput as readSharedRuntimeMessageSendInput,
  readRuntimeSubagentTaskCall as readSharedRuntimeSubagentTaskCall,
  type PluginCallContext,
  type PluginMessageTargetRef,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { readJsonObjectValue } from './plugin-llm-payload.helpers';
import {
  readOptionalBooleanValue,
  readOptionalNumberValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';

export type RuntimeValueReader<T> = (value: JsonValue, label: string) => T | undefined;

function throwRuntimeBadRequest(error: unknown): never {
  throw new BadRequestException(String((error as Error).message));
}

export function requireRuntimeContextField(
  context: PluginCallContext,
  field: 'conversationId' | 'userId',
  method: string,
): string {
  const value = context[field];
  if (value) {
    return value;
  }

  throw new BadRequestException(`${method} 需要 ${field} 上下文`);
}

export function readOptionalRuntimeValue<T>(
  params: JsonObject,
  key: string,
  method: string,
  reader: RuntimeValueReader<T>,
): T | undefined {
  try {
    return reader(params[key], `${method} 的 ${key}`);
  } catch (error) {
    return throwRuntimeBadRequest(error);
  }
}

export function requireRuntimeStringValue(value: JsonValue, label: string): string {
  if (typeof value === 'string') {
    return value;
  }

  throw new BadRequestException(`${label} 必须是字符串`);
}

export function requireRuntimeJsonObjectValue(value: JsonValue, label: string): JsonObject {
  try {
    return readJsonObjectValue(value, label);
  } catch (error) {
    return throwRuntimeBadRequest(error);
  }
}

export function readOptionalRuntimeBoolean(
  params: JsonObject,
  key: string,
  method: string,
): boolean | undefined {
  return readOptionalRuntimeValue(params, key, method, readOptionalBooleanValue);
}

export function readOptionalRuntimeString(
  params: JsonObject,
  key: string,
  method: string,
): string | undefined {
  return readOptionalRuntimeValue(params, key, method, readOptionalStringValue);
}

export function readPositiveRuntimeNumber(
  params: JsonObject,
  key: string,
  method: string,
): number {
  const value = readOptionalRuntimeValue(params, key, method, readOptionalNumberValue);
  if (typeof value !== 'number' || value <= 0) {
    throw new BadRequestException(`${method} 的 ${key} 必须是正数`);
  }

  return value;
}

export function readOptionalRuntimeMessageTarget(
  params: JsonObject,
  key: string,
  method: string,
): PluginMessageTargetRef | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const objectValue = requireRuntimeJsonObjectValue(value, `${method} 的 ${key}`);
  if (objectValue.type !== 'conversation') {
    throw new BadRequestException(`${method} 的 ${key}.type 当前只支持 conversation`);
  }

  const conversationId = requireRuntimeStringValue(
    objectValue.id,
    `${method} 的 ${key}.id`,
  ).trim();
  if (!conversationId) {
    throw new BadRequestException(`${method} 的 ${key}.id 必须是非空字符串`);
  }

  return {
    type: 'conversation',
    id: conversationId,
  };
}

export function readRuntimeMessageSendInput(params: JsonObject, method: 'message.send') {
  try {
    return readSharedRuntimeMessageSendInput(params, method);
  } catch (error) {
    return throwRuntimeBadRequest(error);
  }
}

export function readRuntimeConversationSessionCall(
  params: JsonObject,
  method:
    | 'conversation.session.start'
    | 'conversation.session.get'
    | 'conversation.session.keep'
    | 'conversation.session.finish',
) {
  try {
    return readSharedRuntimeConversationSessionCall(params, method);
  } catch (error) {
    return throwRuntimeBadRequest(error);
  }
}

export function readRuntimeSubagentTaskCall(
  params: JsonObject,
  method:
    | 'subagent.run'
    | 'subagent.task.list'
    | 'subagent.task.get'
    | 'subagent.task.start',
) {
  try {
    return readSharedRuntimeSubagentTaskCall(params, method);
  } catch (error) {
    return throwRuntimeBadRequest(error);
  }
}
