import type { AiProviderMode } from '@garlic-claw/shared';
import { isCatalogProviderMode } from '@garlic-claw/shared';
import type { StoredAiProviderConfig } from './config/config-manager.service';
import { createInferredModelConfig } from './model-config.helpers';
import { isProviderProtocolDriver } from './provider-catalog';
import { resolveProviderCatalogBinding } from './provider-resolution.helpers';
import type { ModelConfig } from './types/provider.types';
import type { ModelCapabilities } from './types/provider.types';

/**
 * provider 写入输入。
 */
export interface UpsertAiProviderInput {
  /** provider 模式。 */
  mode: AiProviderMode;
  /** catalog driver 或协议协议族。 */
  driver: string;
  /** provider 名称。 */
  name: string;
  /** API Key。 */
  apiKey?: string;
  /** Base URL。 */
  baseUrl?: string;
  /** 默认模型。 */
  defaultModel?: string;
  /** 模型列表。 */
  models: string[];
}

/**
 * 模型写入输入。
 */
export interface UpsertAiModelInput {
  /** 模型显示名称。 */
  name?: string;
  /** 能力覆盖。 */
  capabilities?: Partial<Omit<ModelCapabilities, 'input' | 'output'>> & {
    input?: Partial<ModelCapabilities['input']>;
    output?: Partial<ModelCapabilities['output']>;
  };
}

/**
 * 校验 provider 写入输入。
 * @param input provider 输入
 */
export function validateManagedProviderInput(input: UpsertAiProviderInput): void {
  if (isCatalogProviderMode(input.mode)) {
    if (!resolveProviderCatalogBinding(input.mode, input.driver)) {
      throw new Error(`Unknown provider catalog driver "${input.driver}"`);
    }
    return;
  }

  if (!isProviderProtocolDriver(input.driver)) {
    throw new Error(
      'Protocol provider driver must be one of: openai, anthropic, gemini',
    );
  }
}

/**
 * 构建统一的模型配置。
 * @param provider provider 配置
 * @param modelId 模型 ID
 * @param name 可选显示名称
 * @returns 注册表使用的模型配置
 */
export function buildManagedModelConfig(
  provider: StoredAiProviderConfig,
  modelId: string,
  name?: string,
): ModelConfig {
  const resolved = resolveProviderCatalogBinding(provider.mode, provider.driver);

  return createInferredModelConfig({
    modelId,
    providerId: provider.id,
    baseUrl: provider.baseUrl ?? resolved?.defaultBaseUrl ?? '',
    npm: resolved?.npm ?? '@ai-sdk/openai',
    name,
  });
}
