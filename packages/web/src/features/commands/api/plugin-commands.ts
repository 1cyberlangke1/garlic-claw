import { request } from '@/api/base'
import type { PluginCommandOverview } from '@garlic-claw/shared'

export function listPluginCommandOverview() {
  return request<PluginCommandOverview>('/plugin-commands/overview')
}
