import { get } from '@/api/http'
import type { PluginCommandCatalogVersion, PluginCommandOverview } from '@garlic-claw/shared'

export function listPluginCommandOverview() {
  return get<PluginCommandOverview>('/plugin-commands/overview')
}

export function getPluginCommandCatalogVersion() {
  return get<PluginCommandCatalogVersion>('/plugin-commands/version')
}
