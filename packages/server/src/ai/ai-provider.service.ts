/**
 * AI 运行时统一门面
 *
 * 输入:
 * - provider ID
 * - model ID
 * - 运行时 provider 注册表
 *
 * 输出:
 * - 对应的语言模型实例
 * - 统一的模型配置与能力描述
 *
 * 预期行为:
 * - provider 同步、缓存与版本控制收敛到 registry 层
 * - 当前服务只保留模型访问与配置兜底
 */

import type { LanguageModel } from 'ai';
import { Injectable } from '@nestjs/common';
import {
  buildRuntimeModelConfig,
  type RuntimeProviderRegistration,
} from './ai-provider.helpers';
import { ModelRegistryService } from './registry/model-registry.service';
import { RuntimeProviderRegistryService } from './registry/runtime-provider-registry.service';
import type { ModelConfig } from './types/provider.types';

@Injectable()
export class AiProviderService {
  constructor(
    private readonly runtimeProviderRegistry: RuntimeProviderRegistryService,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  /**
   * 获取语言模型实例。
   * @param provider 指定 provider，可选
   * @param model 指定模型，可选
   * @returns 语言模型实例
   */
  getModel(provider?: string, model?: string): LanguageModel {
    const registration = this.runtimeProviderRegistry.getRegistration(provider);
    return registration.createModel(model ?? registration.defaultModel);
  }

  /**
   * 获取统一的模型配置。
   * @param provider 指定 provider，可选
   * @param model 指定模型，可选
   * @returns 推断后的模型配置
   */
  getModelConfig(provider?: string, model?: string): ModelConfig {
    const registration = this.runtimeProviderRegistry.getRegistration(provider);
    const modelId = model ?? registration.defaultModel;
    return this.modelRegistry.getOrRegisterModel(
      registration.id,
      modelId,
      () => this.buildModelConfig(registration, modelId),
    );
  }

  /**
   * 列出当前可用 provider。
   * @returns provider ID 列表
   */
  getAvailableProviders(): string[] {
    return this.runtimeProviderRegistry.listProviderIds();
  }

  /**
   * 构建统一的模型配置。
   * @param registration provider 注册信息
   * @param modelId 模型 ID
   * @returns 统一模型配置
   */
  private buildModelConfig(
    registration: RuntimeProviderRegistration,
    modelId: string,
  ): ModelConfig {
    return buildRuntimeModelConfig(registration, modelId);
  }
}
