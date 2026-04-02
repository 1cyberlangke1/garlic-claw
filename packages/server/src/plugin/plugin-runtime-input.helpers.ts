import type {
  ActionConfig,
  ChatMessagePart,
  PluginCallContext,
  PluginLlmMessage,
  PluginMessageTargetRef,
  PluginSubagentRequest,
  TriggerConfig,
} from '@garlic-claw/shared';
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
import {
  readJsonObjectValue,
  readPluginChatMessageParts,
  readPluginLlmMessages,
} from './plugin-llm-payload.helpers';
import { normalizePositiveInteger } from './plugin-runtime-validation.helpers';

export function readRuntimeTimeoutMs(
  context: PluginCallContext,
  fallback: number,
): number {
  const raw = context.metadata?.timeoutMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }

  return raw;
}

export function requireRuntimeConversationId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.conversationId) {
    throw new BadRequestException(`${method} 需要 conversationId 上下文`);
  }

  return context.conversationId;
}

export function requireRuntimeUserId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.userId) {
    throw new BadRequestException(`${method} 需要 userId 上下文`);
  }

  return context.userId;
}

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

export function readRuntimeSubagentRequest(
  params: JsonObject,
  method: string,
): PluginSubagentRequest {
  const providerId = readOptionalRuntimeString(params, 'providerId', method);
  const modelId = readOptionalRuntimeString(params, 'modelId', method);
  const system = readOptionalRuntimeString(params, 'system', method);
  const toolNames = readOptionalRuntimeStringArray(params, 'toolNames', method);
  const variant = readOptionalRuntimeString(params, 'variant', method);
  const providerOptions = readOptionalRuntimeObject(
    params,
    'providerOptions',
    method,
  );
  const headers = readOptionalRuntimeStringRecord(params, 'headers', method);
  const maxOutputTokens = readOptionalRuntimeNumber(
    params,
    'maxOutputTokens',
    method,
  );
  const maxSteps = readOptionalRuntimeNumber(params, 'maxSteps', method);

  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(system ? { system } : {}),
    messages: readRuntimeLlmMessages(params, method),
    ...(toolNames ? { toolNames } : {}),
    ...(variant ? { variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    maxSteps: normalizePositiveInteger(maxSteps, 5),
  };
}

export function readRuntimeSubagentTaskStartParams(
  params: JsonObject,
  method: string,
): {
  request: PluginSubagentRequest;
  writeBackTarget?: PluginMessageTargetRef;
} {
  const request = readRuntimeSubagentRequest(params, method);
  const rawWriteBack = params.writeBack;
  if (rawWriteBack === undefined || rawWriteBack === null) {
    return { request };
  }

  const writeBack = requireRuntimeJsonObjectValue(
    rawWriteBack,
    `${method} 的 writeBack`,
  );
  const writeBackTarget = readOptionalRuntimeMessageTarget(
    writeBack,
    'target',
    `${method}.writeBack`,
  );

  return {
    request,
    ...(writeBackTarget ? { writeBackTarget } : {}),
  };
}

export function readRuntimeAutomationTrigger(
  params: JsonObject,
  method: string,
): TriggerConfig {
  const value = requireRuntimeJsonObjectValue(params.trigger, `${method} 的 trigger`);
  if (
    value.type !== 'cron'
    && value.type !== 'event'
    && value.type !== 'manual'
  ) {
    throw new BadRequestException(`${method} 的 trigger.type 不合法`);
  }

  const trigger: TriggerConfig = {
    type: value.type,
  };
  if ('cron' in value && value.cron !== undefined) {
    if (typeof value.cron !== 'string') {
      throw new BadRequestException(`${method} 的 trigger.cron 必须是字符串`);
    }
    trigger.cron = value.cron;
  }
  if ('event' in value && value.event !== undefined) {
    if (typeof value.event !== 'string') {
      throw new BadRequestException(`${method} 的 trigger.event 必须是字符串`);
    }
    trigger.event = value.event;
  }

  return trigger;
}

export function readRuntimeAutomationActions(
  params: JsonObject,
  method: string,
): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${method} 的 actions 必须是数组`);
  }

  return value.map((action, index) =>
    readRuntimeAutomationAction(action, index, method),
  );
}

function readRuntimeAutomationAction(
  value: JsonValue,
  index: number,
  method: string,
): ActionConfig {
  const actionValue = requireRuntimeJsonObjectValue(
    value,
    `${method} 的 actions[${index}]`,
  );
  if (
    actionValue.type !== 'device_command'
    && actionValue.type !== 'ai_message'
  ) {
    throw new BadRequestException(`${method} 的 actions[${index}].type 不合法`);
  }

  if (actionValue.type === 'device_command') {
    if (typeof actionValue.plugin !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].plugin 必须是字符串`,
      );
    }
    if (typeof actionValue.capability !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].capability 必须是字符串`,
      );
    }

    const action: ActionConfig = {
      type: actionValue.type,
      plugin: actionValue.plugin,
      capability: actionValue.capability,
    };
    if ('params' in actionValue && actionValue.params !== undefined) {
      action.params = requireRuntimeJsonObjectValue(
        actionValue.params,
        `${method} 的 actions[${index}].params`,
      );
    }

    return action;
  }

  const action: ActionConfig = {
    type: actionValue.type,
  };
  if ('message' in actionValue && actionValue.message !== undefined) {
    if (typeof actionValue.message !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].message 必须是字符串`,
      );
    }
    action.message = actionValue.message;
  }
  if ('target' in actionValue && actionValue.target !== undefined) {
    action.target = readOptionalRuntimeMessageTarget(
      actionValue,
      'target',
      `${method}.actions[${index}]`,
    );
  }

  return action;
}
