import { get } from '@/api/http'
import type { PluginCommandCatalogVersion, PluginCommandOverview } from '@garlic-claw/shared'

export function listPluginCommandOverview() {
  return get<PluginCommandOverview>('/command-catalog/overview')
}

export function getPluginCommandCatalogVersion() {
  return get<PluginCommandCatalogVersion>('/command-catalog/version')
}
