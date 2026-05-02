import {
  type AiProviderCatalogItem,
  type AiProviderConfig,
  type AiProviderSummary,
  type ProviderProtocolDriver,
} from '@garlic-claw/shared'

type ProviderLike =
  | Pick<AiProviderConfig, 'id' | 'driver'>
  | Pick<AiProviderSummary, 'id' | 'driver'>

export const PROVIDER_PROTOCOL_DRIVERS: ProviderProtocolDriver[] = [
  'openai',
  'anthropic',
  'gemini',
]

export interface ProviderDriverOption {
  id: ProviderProtocolDriver
  name: string
  label: string
}

export function findAiProviderCatalogItem(
  catalog: AiProviderCatalogItem[],
  driver: string,
): AiProviderCatalogItem | null {
  return catalog.find((item) => item.id === driver) ?? null
}

export const protocolLabels: Record<ProviderProtocolDriver, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

const protocolDriverNames: Record<ProviderProtocolDriver, string> = {
  openai: 'OpenAI 兼容协议',
  anthropic: 'Anthropic 协议',
  gemini: 'Gemini 协议',
}

export const protocolDriverOptions: ProviderDriverOption[] =
  PROVIDER_PROTOCOL_DRIVERS.map((id) => ({
    id,
    name: protocolDriverNames[id],
    label: protocolDriverNames[id],
  }))

export function getProtocolLabel(
  protocol: string,
  fallback = protocol,
): string {
  return protocolLabels[protocol as ProviderProtocolDriver] ?? fallback
}

export function isCoreProviderPreset(
  provider: ProviderLike,
  catalog: AiProviderCatalogItem[],
): boolean {
  const catalogProvider = findAiProviderCatalogItem(catalog, provider.driver)
  return Boolean(catalogProvider) && provider.id === provider.driver
}

export function getProviderKindLabel(
  provider: ProviderLike,
  catalog: AiProviderCatalogItem[],
): string {
  return isCoreProviderPreset(provider, catalog) ? '内建' : '自定义'
}

export function getProviderDriverLabel(
  provider: ProviderLike,
  catalog: AiProviderCatalogItem[],
): string {
  const protocolLabel = getProtocolLabel(provider.driver, provider.driver)
  if (!isCoreProviderPreset(provider, catalog)) {
    return `${protocolLabel} 兼容协议`
  }
  const catalogProvider = findAiProviderCatalogItem(catalog, provider.driver)
  return catalogProvider
    ? `${catalogProvider.name} · ${getProtocolLabel(catalogProvider.protocol)}`
    : protocolLabel
}

export function getProviderDriverHint(
  driver: string,
  providerId: string,
  catalog: AiProviderCatalogItem[],
): string {
  const protocolLabel = getProtocolLabel(driver, 'OpenAI')
  const catalogProvider = findAiProviderCatalogItem(catalog, driver)
  if (catalogProvider && providerId.trim() === driver) {
    return `当前 ID 与内建 ${protocolLabel} 供应商一致，将自动带出默认地址和默认模型。`
  }
  return `当前按 ${protocolLabel} 协议连接供应商；ID 不等于驱动时视为自定义供应商。`
}
