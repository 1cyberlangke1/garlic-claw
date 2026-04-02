import type {
  AiUtilityModelRole,
  PluginCallContext,
  PluginEventLevel,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginLlmMessage,
  PluginProviderSummary,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import { deserializeMessageParts } from '../chat/message-parts';
import { toJsonValue } from '../common/utils/json-value';
import {
  readOptionalNumberValue,
  readOptionalObjectValue,
  readOptionalStringRecordValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';
import { readPluginLlmMessages } from './plugin-llm-payload.helpers';
import type { ModelConfig } from '../ai/types/provider.types';

/**
 * 从上下文中读取 userId。
 * @param context 插件调用上下文
 * @param method 当前 Host API 方法名
 * @returns userId
 */
export function requireHostUserId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.userId) {
    throw new BadRequestException(`${method} 需要 userId 上下文`);
  }

  return context.userId;
}

/**
 * 从上下文中读取 conversationId。
 * @param context 插件调用上下文
 * @param method 当前 Host API 方法名
 * @returns conversationId
 */
export function requireHostConversationId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.conversationId) {
    throw new BadRequestException(`${method} 需要 conversationId 上下文`);
  }

  return context.conversationId;
}

/**
 * 从参数对象读取可选字符串字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 字段值；缺失时返回 null
 */
export function readHostString(params: JsonObject, key: string): string | null {
  try {
    return readOptionalStringValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

/**
 * 从参数对象读取必填字符串字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 字段值
 */
export function requireHostString(params: JsonObject, key: string): string {
  const value = readHostString(params, key);
  if (value === null) {
    throw new BadRequestException(`${key} 必填`);
  }

  return value;
}

/**
 * 从参数对象读取数字字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 字段值；缺失时返回 null
 */
export function readHostNumber(params: JsonObject, key: string): number | null {
  try {
    return readOptionalNumberValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

/**
 * 从参数对象读取 JSON 对象字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 字段值；缺失时返回 null
 */
export function readHostObject(
  params: JsonObject,
  key: string,
): JsonObject | null {
  try {
    return readOptionalObjectValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

/**
 * 从参数对象读取必填 JSON 值字段。
 * @param params 参数对象
 * @param key 字段名
 * @param method 当前 Host API 方法名
 * @returns JSON 值
 */
export function requireHostJsonValue(
  params: JsonObject,
  key: string,
  method: string,
): JsonValue {
  if (!Object.prototype.hasOwnProperty.call(params, key)) {
    throw new BadRequestException(`${method} 缺少 ${key}`);
  }

  return params[key];
}

/**
 * 从参数对象读取字符串字典字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 字段值；缺失时返回 null
 */
export function readHostStringRecord(
  params: JsonObject,
  key: string,
): Record<string, string> | null {
  try {
    return readOptionalStringRecordValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

/**
 * 从参数对象读取插件事件级别字段。
 * @param params 参数对象
 * @param key 字段名
 * @returns 受支持的事件级别
 */
export function readHostEventLevel(
  params: JsonObject,
  key: string,
): PluginEventLevel {
  const value = requireHostString(params, key);
  if (value !== 'info' && value !== 'warn' && value !== 'error') {
    throw new BadRequestException(`${key} 必须是 info/warn/error`);
  }

  return value;
}

/**
 * 从 Host API 参数中读取统一 LLM 生成参数。
 * @param params Host API 原始参数
 * @param messages 已解析消息
 * @returns 统一生成参数
 */
export function readHostGenerateParams(
  params: JsonObject,
  messages: PluginLlmGenerateParams['messages'],
): PluginLlmGenerateParams {
  const providerId = readHostString(params, 'providerId') ?? undefined;
  const modelId = readHostString(params, 'modelId') ?? undefined;
  const system = readHostString(params, 'system') ?? undefined;
  const variant = readHostString(params, 'variant') ?? undefined;
  const providerOptions = readHostObject(params, 'providerOptions') ?? undefined;
  const headers = readHostStringRecord(params, 'headers') ?? undefined;
  const maxOutputTokens = readHostNumber(params, 'maxOutputTokens') ?? undefined;

  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(system ? { system } : {}),
    ...(variant ? { variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    messages,
  };
}

/**
 * 为未显式指定 provider/model 的插件生成请求选择 utility role。
 * @param pluginId 调用插件 ID
 * @param context 插件调用上下文
 * @param params 已解析的生成参数
 * @returns 可选 utility role
 */
export function resolveHostUtilityRoleForGeneration(
  pluginId: string,
  context: PluginCallContext,
  params: Pick<PluginLlmGenerateParams, 'providerId' | 'modelId'>,
): AiUtilityModelRole | undefined {
  if (params.providerId || params.modelId) {
    return undefined;
  }

  if (
    pluginId === 'builtin.conversation-title'
    && context.activeProviderId
    && context.activeModelId
  ) {
    params.providerId = context.activeProviderId;
    params.modelId = context.activeModelId;
    return 'conversationTitle';
  }

  return 'pluginGenerateText';
}

/**
 * 从参数中读取统一结构化消息数组。
 * @param params 参数对象
 * @returns 已校验的消息数组
 */
export function readHostLlmMessages(params: JsonObject): PluginLlmMessage[] {
  return readPluginLlmMessages(params.messages, {
    arrayLabel: 'messages',
  });
}

export function buildCurrentHostProviderInfo(
  context: PluginCallContext,
  fallbackModelConfig: Pick<ModelConfig, 'providerId' | 'id'>,
) {
  if (context.activeProviderId && context.activeModelId) {
    return {
      source: 'context' as const,
      providerId: context.activeProviderId,
      modelId: context.activeModelId,
    };
  }

  return {
    source: 'default' as const,
    providerId: String(fallbackModelConfig.providerId),
    modelId: String(fallbackModelConfig.id),
  };
}

export function buildHostProviderModelSummary(
  model: Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>,
) {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    capabilities: model.capabilities,
    status: model.status,
  };
}

export function findHostProviderSummary(
  providers: PluginProviderSummary[],
  providerId: string,
): PluginProviderSummary | null {
  return providers.find((item) => item.id === providerId) ?? null;
}

export function findHostProviderSummaryOrThrow(input: {
  providers: PluginProviderSummary[];
  providerId: string;
  ensureExists?: (providerId: string) => unknown;
}): PluginProviderSummary {
  const provider = findHostProviderSummary(input.providers, input.providerId);
  if (provider) {
    return provider;
  }

  input.ensureExists?.(input.providerId);
  throw new NotFoundException(`Provider "${input.providerId}" not found`);
}

export function resolveHostProviderModelSummary(input: {
  registryModel?: Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>;
  listedModels: Array<
    Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>
  >;
  modelId: string;
}) {
  const model = input.registryModel
    ?? input.listedModels.find((item) => String(item.id) === input.modelId)
    ?? null;
  return model ? buildHostProviderModelSummary(model) : null;
}

export function buildHostGenerateResult(input: {
  modelConfig: Pick<ModelConfig, 'providerId' | 'id'>;
  result: {
    text: string;
    finishReason?: unknown;
    usage?: JsonValue;
  };
}): PluginLlmGenerateResult {
  return {
    providerId: String(input.modelConfig.providerId),
    modelId: String(input.modelConfig.id),
    text: input.result.text,
    message: {
      role: 'assistant',
      content: input.result.text,
    },
    ...(input.result.finishReason !== undefined
      ? { finishReason: String(input.result.finishReason) }
      : {}),
    ...(input.result.usage !== undefined
      ? { usage: toJsonValue(input.result.usage) }
      : {}),
  };
}

export function buildHostGenerateExecutionInput(input: {
  params: PluginLlmGenerateParams;
  utilityRole?: AiUtilityModelRole;
}) {
  return {
    ...(input.params.providerId ? { providerId: input.params.providerId } : {}),
    ...(input.params.modelId ? { modelId: input.params.modelId } : {}),
    ...(input.utilityRole ? { utilityRole: input.utilityRole } : {}),
    ...(input.params.system ? { system: input.params.system } : {}),
    ...(input.params.variant ? { variant: input.params.variant } : {}),
    ...(input.params.providerOptions ? { providerOptions: input.params.providerOptions } : {}),
    ...(input.params.headers ? { headers: input.params.headers } : {}),
    ...(typeof input.params.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.params.maxOutputTokens }
      : {}),
    sdkMessages: toAiSdkMessages(input.params.messages),
  };
}

export function buildHostGenerateTextResult(
  result: Pick<PluginLlmGenerateResult, 'providerId' | 'modelId' | 'text'>,
) {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
  };
}

/**
 * 转换对话摘要。
 * @param input 对话记录
 * @returns 可序列化摘要
 */
export function toConversationSummary(input: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    title: input.title,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function requireHostConversationRecord(input: {
  conversation: {
    id: string;
    title: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  context: PluginCallContext;
  method: string;
}) {
  if (!input.conversation) {
    const conversationId = input.context.conversationId ?? 'unknown';
    throw new NotFoundException(`Conversation not found: ${conversationId}`);
  }

  if (
    input.context.userId
    && input.conversation.userId !== input.context.userId
  ) {
    throw new ForbiddenException(`${input.method} 无权访问当前会话`);
  }

  return input.conversation;
}

/**
 * 转换记忆摘要。
 * @param input 记忆记录
 * @returns 可序列化摘要
 */
export function toMemorySummary(input: {
  id: string;
  content: string;
  category: string;
  createdAt: Date;
}) {
  return {
    id: input.id,
    content: input.content,
    category: input.category,
    createdAt: input.createdAt.toISOString(),
  };
}

/**
 * 转换用户摘要。
 * @param input 用户记录
 * @returns 可序列化摘要
 */
export function toUserSummary(input: {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    username: input.username,
    email: input.email,
    role: input.role,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function requireHostUserSummary(input: {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  userId: string;
}) {
  if (!input.user) {
    throw new NotFoundException(`User not found: ${input.userId}`);
  }

  return toUserSummary(input.user);
}

/**
 * 转换对话消息摘要。
 * @param input 消息记录
 * @returns 可序列化摘要
 */
export function toConversationMessageSummary(input: {
  id: string;
  role: string;
  content: string | null;
  partsJson: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    parts: deserializeMessageParts(input.partsJson),
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function buildConversationMessageSummaries(
  messages: Array<{
    id: string;
    role: string;
    content: string | null;
    partsJson: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  return messages.map((message) => toConversationMessageSummary(message));
}
