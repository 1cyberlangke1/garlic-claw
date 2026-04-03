import { findAiProviderCatalogItem } from '@garlic-claw/shared';
import { isCatalogProviderMode, type AiProviderMode } from '@garlic-claw/shared';
import { getProviderProtocolNpm } from './provider-protocol.helpers';
import {
  isProviderProtocolDriver,
  type ProviderProtocolDriver,
  PROVIDER_CATALOG,
} from './provider-catalog';

/**
 * provider 目录解析结果。
 */
export interface ResolvedProviderCatalogBinding {
  /** 运行时协议族。 */
  protocol: ProviderProtocolDriver;
  /** 协议族 SDK 包名。 */
  npm: string;
  /** 目录默认 base URL。 */
  defaultBaseUrl: string;
  /** 目录默认模型。 */
  defaultModel: string;
}

/**
 * 将 provider 模式与 driver 解析成统一目录绑定。
 * @param mode provider 接入模式
 * @param driver provider driver
 * @returns 解析结果；非法 driver 时返回 null
 */
export function resolveProviderCatalogBinding(
  mode: AiProviderMode,
  driver: string,
): ResolvedProviderCatalogBinding | null {
  if (isCatalogProviderMode(mode)) {
    const catalogItem = findAiProviderCatalogItem(PROVIDER_CATALOG, driver);
    if (!catalogItem) {
      return null;
    }

    return {
      protocol: catalogItem.protocol,
      npm: getProviderProtocolNpm(catalogItem.protocol),
      defaultBaseUrl: catalogItem.defaultBaseUrl,
      defaultModel: catalogItem.defaultModel,
    };
  }

  if (!isProviderProtocolDriver(driver)) {
    return null;
  }

  const catalogItem = findAiProviderCatalogItem(PROVIDER_CATALOG, driver);
  return {
    protocol: driver,
    npm: getProviderProtocolNpm(driver),
    defaultBaseUrl: catalogItem?.defaultBaseUrl ?? '',
    defaultModel: catalogItem?.defaultModel ?? '',
  };
}
