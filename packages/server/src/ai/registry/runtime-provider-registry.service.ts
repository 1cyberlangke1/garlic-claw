import { Injectable, Logger } from '@nestjs/common';
import { isCatalogProviderMode } from '@garlic-claw/shared';
import {
  buildRuntimeProviderRegistration,
  type RuntimeProviderInput,
  type RuntimeProviderRegistration,
} from '../ai-provider.helpers';
import {
  ConfigManagerService,
  type StoredAiProviderConfig,
} from '../config/config-manager.service';
import { resolveProviderCatalogBinding } from '../provider-resolution.helpers';
import { ModelRegistryService } from './model-registry.service';

/**
 * 运行时 provider 注册表。
 *
 * 输入:
 * - AI 配置文件中的 provider 列表
 *
 * 输出:
 * - 当前可用的运行时 provider 注册信息
 *
 * 预期行为:
 * - 只负责同步配置驱动的 runtime provider
 * - provider 变更时清理失效的模型注册
 * - 不再让上层 service 自己维护 provider map 与版本戳
 */
@Injectable()
export class RuntimeProviderRegistryService {
  private readonly logger = new Logger(RuntimeProviderRegistryService.name);
  private readonly providers = new Map<string, RuntimeProviderRegistration>();
  private configuredProvidersVersion = '';
  private configuredProviderIds = new Set<string>();

  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly modelRegistry: ModelRegistryService,
  ) {
    this.syncProviders();
  }

  /**
   * 获取运行时 provider 注册信息。
   * @param provider 指定 provider，可选
   * @returns 运行时 provider 注册信息
   */
  getRegistration(provider?: string): RuntimeProviderRegistration {
    this.syncProviders();
    const providerIds = Array.from(this.providers.keys());
    const providerId = provider ?? providerIds[0];
    const registration = providerId ? this.providers.get(providerId) : undefined;

    if (!registration) {
      throw new Error(
        `AI provider "${providerId ?? 'unset'}" is not configured. Available providers: ${providerIds.join(', ')}`,
      );
    }

    return registration;
  }

  /**
   * 列出当前可用 provider ID。
   * @returns provider ID 列表
   */
  listProviderIds(): string[] {
    this.syncProviders();
    return Array.from(this.providers.keys());
  }

  /**
   * 同步配置文件中的 provider 到运行时注册表。
   */
  private syncProviders(): void {
    const settingsVersion = this.configManager.getSettingsVersion();
    if (settingsVersion === this.configuredProvidersVersion) {
      return;
    }

    const configuredProviders = this.configManager.listProviders();
    const nextConfiguredProviderIds = new Set(
      configuredProviders.map((provider) => provider.id),
    );

    for (const providerId of this.configuredProviderIds) {
      if (!nextConfiguredProviderIds.has(providerId)) {
        this.modelRegistry.clearProviderModels(providerId);
      }
    }

    this.providers.clear();

    for (const provider of configuredProviders) {
      this.registerConfiguredProvider(provider);
    }

    this.configuredProvidersVersion = settingsVersion;
    this.configuredProviderIds = nextConfiguredProviderIds;
  }

  /**
   * 注册配置文件驱动的 provider。
   * @param provider 持久化的 provider 配置
   */
  private registerConfiguredProvider(provider: StoredAiProviderConfig): void {
    const resolved = resolveProviderCatalogBinding(provider.mode, provider.driver);
    if (!resolved) {
      const providerKind = isCatalogProviderMode(provider.mode)
        ? 'catalog 项'
        : '协议协议族';
      this.logger.warn(`忽略不支持的 ${providerKind}: ${provider.driver}`);
      return;
    }

    if (!provider.apiKey) {
      const providerKind = isCatalogProviderMode(provider.mode)
        ? 'catalog provider'
        : '协议接入';
      this.logger.debug(`跳过未配置 API key 的${providerKind}: ${provider.id}`);
      return;
    }

    this.registerRuntimeProvider({
      id: provider.id,
      driver: resolved.protocol,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl ?? resolved.defaultBaseUrl,
      defaultModel:
        provider.defaultModel ?? provider.models[0] ?? resolved.defaultModel,
      npm: resolved.npm,
    });
  }

  /**
   * 向运行时注册 provider。
   * @param input provider 注册输入
   */
  private registerRuntimeProvider(input: RuntimeProviderInput): void {
    this.providers.set(input.id, buildRuntimeProviderRegistration(input));
  }
}
