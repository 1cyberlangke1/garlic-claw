import type {
  ChatMessagePart,
  PluginLlmMessage,
  PluginMessageTargetRef,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject } from '../common/types/json-value';
import {
  readPluginChatMessageParts,
  readPluginLlmMessages,
} from './plugin-llm-payload.helpers';
import { requireRuntimeJsonObjectValue } from './plugin-runtime-params.helpers';

export function readRuntimeLlmMessages(
  params: JsonObject,
  method: string,
): PluginLlmMessage[] {
  return readPluginLlmMessages(params.messages, {
    arrayLabel: `${method} 的 messages`,
  });
}

export function readOptionalRuntimeChatMessageParts(
  params: JsonObject,
  key: string,
  method: string,
): ChatMessagePart[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  return readPluginChatMessageParts(value, {
    arrayLabel: `${method} 的 ${key}`,
    itemLabelPrefix: `${method}.${key}`,
  });
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
  if (typeof objectValue.id !== 'string' || !objectValue.id.trim()) {
    throw new BadRequestException(`${method} 的 ${key}.id 必须是非空字符串`);
  }

  return {
    type: 'conversation',
    id: objectValue.id.trim(),
  };
}
