import { createRequire } from 'node:module';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { createInferredModelConfig } from './model-config.helpers';

import type { ProviderProtocolDriver } from './provider-catalog';
import type { ModelConfig } from './types/provider.types';

/**
 * 已注册 provider 的运行时信息。
 */
export interface RuntimeProviderRegistration {
  /** provider ID。 */
  id: string;
  /** provider driver。 */
  driver: ProviderProtocolDriver;
  /** provider 的语言模型创建函数。 */
  createModel: (modelId: string) => LanguageModel;
  /** provider 默认 base URL。 */
  baseUrl: string;
  /** SDK npm 包名。 */
  npm: string;
  /** provider 默认模型。 */
  defaultModel: string;
}

/**
 * provider SDK 工厂的输入。
 */
interface ProviderSdkOptions {
  /** API Key。 */
  apiKey: string;
  /** Base URL。 */
  baseURL?: string;
  /** provider 名称。 */
  name: string;
}

type ProviderSdkFactory = (
  options: ProviderSdkOptions,
) => CallableProviderFactory | ChatProviderFactory;

/**
 * 可调用 provider 工厂。
 */
interface CallableProviderFactory {
  /** 直接按模型 ID 创建模型。 */
  (modelId: string): LanguageModel;
}

/**
 * 带 `chat()` 工厂的 provider。
 */
interface ChatProviderFactory {
  /** 按聊天模型 ID 创建模型。 */
  chat: (modelId: string) => LanguageModel;
}

/**
 * provider 运行时注册输入。
 */
export interface RuntimeProviderInput {
  /** provider ID。 */
  id: string;
  /** provider driver。 */
  driver: ProviderProtocolDriver;
  /** API key。 */
  apiKey: string;
  /** provider 基础地址。 */
  baseUrl: string;
  /** 默认模型。 */
  defaultModel: string;
  /** SDK 包名。 */
  npm: string;
}

/**
 * 运行时支持的协议族 SDK 工厂集合。
 */
const PROTOCOL_PROVIDER_FACTORIES: Record<
  ProviderProtocolDriver,
  ProviderSdkFactory
> = {
  openai: (options) => createOpenAI(options),
  anthropic: (options) => createAnthropic(options),
  gemini: createLazyProviderFactory('@ai-sdk/google', 'createGoogleGenerativeAI'),
};

const localRequire = createRequire(__filename);

function createLazyProviderFactory(
  moduleName: string,
  exportName: string,
): ProviderSdkFactory {
  return (options) => {
    const loadedModule = loadOptionalModule(moduleName);
    const factory = loadedModule[exportName];
    if (typeof factory !== 'function') {
      throw new Error(
        `Provider SDK "${moduleName}" 没有导出 "${exportName}"，无法创建 provider。`,
      );
    }

    return (factory as ProviderSdkFactory)(options);
  };
}

function loadOptionalModule(moduleName: string): Record<string, unknown> {
  try {
    return localRequire(moduleName) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `缺少可选 Provider SDK "${moduleName}"。如需启用对应 provider，请先安装该依赖。原始错误: ${detail}`,
      {
        cause: error,
      },
    );
  }
}

/**
 * 创建运行时 provider 注册信息。
 *
 * 输入:
 * - provider 注册输入
 *
 * 输出:
 * - 运行时可直接使用的 provider 注册对象
 *
 * 预期行为:
 * - 统一创建 SDK provider
 * - 兼容 chat/default 两种模型工厂调用方式
 */
export function buildRuntimeProviderRegistration(
  input: RuntimeProviderInput,
): RuntimeProviderRegistration {
  const factory = PROTOCOL_PROVIDER_FACTORIES[input.driver];
  const provider = factory({
    apiKey: input.apiKey,
    baseURL: input.baseUrl,
    name: input.id,
  });

  return {
    id: input.id,
    driver: input.driver,
    createModel: (modelId) => callProviderModel(provider, input.driver, modelId),
    baseUrl: input.baseUrl,
    npm: input.npm,
    defaultModel: input.defaultModel,
  };
}

/**
 * 根据 provider SDK 的调用形态创建模型。
 *
 * 输入:
 * - SDK provider 实例
 * - 模型 ID
 * - 工厂偏好
 *
 * 输出:
 * - 可直接交给 AI SDK 使用的语言模型
 *
 * 预期行为:
 * - OpenAI 协议接入优先走 `.chat()`
 * - 其他 provider 在 callable/chat 两种形态间自动兼容
 */
export function callProviderModel(
  provider: CallableProviderFactory | ChatProviderFactory,
  driver: ProviderProtocolDriver,
  modelId: string,
): LanguageModel {
  const providerWithChat = provider as Partial<ChatProviderFactory>;
  if (driver === 'openai' && typeof providerWithChat.chat === 'function') {
    return providerWithChat.chat(modelId);
  }

  if (typeof provider === 'function') {
    return provider(modelId);
  }

  if (typeof providerWithChat.chat === 'function') {
    return providerWithChat.chat(modelId);
  }

  throw new Error(`Provider model factory for "${modelId}" is invalid`);
}

/**
 * 构建统一模型配置。
 *
 * 输入:
 * - 运行时 provider 注册信息
 * - 模型 ID
 *
 * 输出:
 * - 注册表使用的模型配置
 *
 * 预期行为:
 * - 未显式注册时仍能给聊天链路提供稳定模型配置
 * - 能力按模型 ID 推断
 */
export function buildRuntimeModelConfig(
  registration: RuntimeProviderRegistration,
  modelId: string,
): ModelConfig {
  return createInferredModelConfig({
    modelId,
    providerId: registration.id,
    baseUrl: registration.baseUrl,
    npm: registration.npm,
  });
}
