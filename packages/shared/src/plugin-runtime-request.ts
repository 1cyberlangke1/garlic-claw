import type { ChatMessagePart } from './chat-message-parts';
import { readPluginMessageTargetInfoValue, readPluginSubagentRequestValue } from './plugin-subagent-task';
import type { JsonObject, JsonValue } from './types/json';
import type { PluginMessageTargetInfo, PluginMessageTargetRef, PluginSubagentRequest } from './types/plugin';

function requireJsonObjectValue(value: JsonValue, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }

  return value;
}

function requireStringValue(value: JsonValue, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} 必须是字符串`);
  }

  return value;
}

function readOptionalStringValue(value: JsonValue, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requireStringValue(value, label);
}

function readOptionalBooleanValue(value: JsonValue, label: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${label} 必须是布尔值`);
  }

  return value;
}

function readOptionalNumberValue(value: JsonValue, label: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number') {
    throw new Error(`${label} 必须是数字`);
  }

  return value;
}

function readOptionalMessageTarget(
  params: JsonObject,
  key: string,
  method: string,
): PluginMessageTargetRef | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const objectValue = requireJsonObjectValue(value, `${method} 的 ${key}`);
  if (objectValue.type !== 'conversation') {
    throw new Error(`${method} 的 ${key}.type 当前只支持 conversation`);
  }

  const conversationId = requireStringValue(
    objectValue.id,
    `${method} 的 ${key}.id`,
  ).trim();
  if (!conversationId) {
    throw new Error(`${method} 的 ${key}.id 必须是非空字符串`);
  }

  return {
    type: 'conversation',
    id: conversationId,
  };
}

function readOptionalChatMessageParts(
  params: JsonObject,
  key: string,
  method: string,
): ChatMessagePart[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${method} 的 ${key} 必须是数组`);
  }

  return value.map((part, index) =>
    readChatMessagePart(part, `${method}.${key}[${index}]`),
  );
}

function readChatMessagePart(value: JsonValue, label: string): ChatMessagePart {
  const part = requireJsonObjectValue(value, label);
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

  throw new Error(`${label} 不是合法的消息 part`);
}

function requirePositiveNumber(
  params: JsonObject,
  key: string,
  method: string,
): number {
  const value = readOptionalNumberValue(params[key], `${method} 的 ${key}`);
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`${method} 的 ${key} 必须是正数`);
  }

  return value;
}

function requireSubagentRequest(
  params: JsonObject,
  method: 'subagent.run' | 'subagent.task.start',
): PluginSubagentRequest {
  const request = readPluginSubagentRequestValue(params, 5);
  if (request) {
    return request;
  }

  throw new Error(`${method} 的请求体不合法`);
}

function readWriteBackTarget(
  params: JsonObject,
  method: 'subagent.task.start',
): PluginMessageTargetInfo | undefined {
  const rawWriteBack = params.writeBack;
  if (rawWriteBack === undefined || rawWriteBack === null) {
    return undefined;
  }

  const writeBack = requireJsonObjectValue(rawWriteBack, `${method} 的 writeBack`);
  const target = readPluginMessageTargetInfoValue(writeBack.target);
  if (!target) {
    throw new Error(`${method}.writeBack.target 不合法`);
  }

  return target;
}

export function readRuntimeMessageSendInput(
  params: JsonObject,
  method: 'message.send',
): {
  target?: PluginMessageTargetRef;
  content?: string;
  parts?: ChatMessagePart[];
  provider?: string;
  model?: string;
} {
  return {
    target: readOptionalMessageTarget(params, 'target', method),
    content: readOptionalStringValue(params.content, `${method} 的 content`),
    parts: readOptionalChatMessageParts(params, 'parts', method),
    provider: readOptionalStringValue(params.provider, `${method} 的 provider`),
    model: readOptionalStringValue(params.model, `${method} 的 model`),
  };
}

export function readRuntimeConversationSessionCall(
  params: JsonObject,
  method:
    | 'conversation.session.start'
    | 'conversation.session.get'
    | 'conversation.session.keep'
    | 'conversation.session.finish',
):
  | {
    sessionMethod: 'start';
    timeoutMs: number;
    captureHistory: boolean;
    metadata?: JsonValue;
  }
  | {
    sessionMethod: 'keep';
    timeoutMs: number;
    resetTimeout: boolean;
  }
  | {
    sessionMethod: 'get' | 'finish';
  } {
  if (method === 'conversation.session.start') {
    return {
      sessionMethod: 'start',
      timeoutMs: requirePositiveNumber(params, 'timeoutMs', method),
      captureHistory:
        readOptionalBooleanValue(params.captureHistory, `${method} 的 captureHistory`) ?? false,
      ...(Object.prototype.hasOwnProperty.call(params, 'metadata')
        ? { metadata: params.metadata }
        : {}),
    };
  }
  if (method === 'conversation.session.keep') {
    return {
      sessionMethod: 'keep',
      timeoutMs: requirePositiveNumber(params, 'timeoutMs', method),
      resetTimeout:
        readOptionalBooleanValue(params.resetTimeout, `${method} 的 resetTimeout`) ?? true,
    };
  }

  return {
    sessionMethod: method === 'conversation.session.finish' ? 'finish' : 'get',
  };
}

export function readRuntimeSubagentTaskCall(
  params: JsonObject,
  method:
    | 'subagent.run'
    | 'subagent.task.list'
    | 'subagent.task.get'
    | 'subagent.task.start',
):
  | {
    subagentMethod: 'run';
    request: PluginSubagentRequest;
  }
  | {
    subagentMethod: 'list';
  }
  | {
    subagentMethod: 'get';
    taskId: string;
  }
  | {
    subagentMethod: 'start';
    request: PluginSubagentRequest;
    writeBackTarget?: PluginMessageTargetInfo;
  } {
  if (method === 'subagent.run') {
    return {
      subagentMethod: 'run',
      request: requireSubagentRequest(params, method),
    };
  }
  if (method === 'subagent.task.list') {
    return {
      subagentMethod: 'list',
    };
  }
  if (method === 'subagent.task.get') {
    return {
      subagentMethod: 'get',
      taskId: requireStringValue(params.taskId, `${method} 的 taskId`),
    };
  }

  return {
    subagentMethod: 'start',
    request: requireSubagentRequest(params, method),
    writeBackTarget: readWriteBackTarget(params, method),
  };
}
