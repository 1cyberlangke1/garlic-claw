import type { ChatMessagePart, PluginLlmMessage } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';

interface IndexedArrayLabelOptions {
  arrayLabel: string;
  itemLabelPrefix?: string;
}

/**
 * 校验并读取结构化 LLM 消息数组。
 * @param value 原始消息数组值
 * @param options 数组与索引标签
 * @returns 已校验的消息数组
 */
export function readPluginLlmMessages(
  value: JsonValue,
  options: IndexedArrayLabelOptions,
): PluginLlmMessage[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${options.arrayLabel} 必须是数组`);
  }

  return value.map((item, index) =>
    readPluginLlmMessage(item, buildIndexedLabel(options, index)),
  );
}

/**
 * 校验并读取结构化消息 part 数组。
 * @param value 原始 part 数组值
 * @param options 数组与索引标签
 * @returns 已校验的消息 part 数组
 */
export function readPluginChatMessageParts(
  value: JsonValue,
  options: IndexedArrayLabelOptions,
): ChatMessagePart[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${options.arrayLabel} 必须是数组`);
  }

  return value.map((part, index) =>
    readPluginChatMessagePart(part, buildIndexedLabel(options, index)),
  );
}

/**
 * 校验并读取单个 JSON 对象值。
 * @param value 原始 JSON 值
 * @param label 当前字段标签
 * @returns 已校验的 JSON 对象
 */
export function readJsonObjectValue(value: JsonValue, label: string): JsonObject {
  if (!isJsonObjectValue(value)) {
    throw new BadRequestException(`${label} 必须是对象`);
  }

  return value;
}

function readPluginLlmMessage(
  value: JsonValue,
  label: string,
): PluginLlmMessage {
  const message = readJsonObjectValue(value, label);
  if (
    message.role !== 'user'
    && message.role !== 'assistant'
    && message.role !== 'system'
    && message.role !== 'tool'
  ) {
    throw new BadRequestException(
      `${label}.role 必须是 user/assistant/system/tool`,
    );
  }

  return {
    role: message.role,
    content: readPluginLlmMessageContent(message.content, `${label}.content`),
  };
}

function readPluginLlmMessageContent(
  value: JsonValue,
  label: string,
): string | ChatMessagePart[] {
  if (typeof value === 'string') {
    return value;
  }

  return readPluginChatMessageParts(value, {
    arrayLabel: label,
  });
}

function readPluginChatMessagePart(
  value: JsonValue,
  label: string,
): ChatMessagePart {
  const part = readJsonObjectValue(value, label);
  if (part.type === 'text' && typeof part.text === 'string') {
    return {
      type: 'text',
      text: part.text,
    };
  }
  if (part.type === 'image' && typeof part.image === 'string') {
    return {
      type: 'image',
      image: part.image,
      ...(typeof part.mimeType === 'string' ? { mimeType: part.mimeType } : {}),
    };
  }

  throw new BadRequestException(`${label} 不是合法的消息 part`);
}

function buildIndexedLabel(
  options: IndexedArrayLabelOptions,
  index: number,
): string {
  const prefix = options.itemLabelPrefix ?? options.arrayLabel;
  return `${prefix}[${index}]`;
}

function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
