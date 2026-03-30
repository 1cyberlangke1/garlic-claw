import type { PluginCommandOverview } from '@garlic-claw/shared'
import { request } from './base'

export function listPluginCommandOverview() {
  return request<PluginCommandOverview>('/plugin-commands/overview')
}
