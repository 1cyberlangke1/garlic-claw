import { get } from '@/api/http'
import type {
  PluginSubagentDetail,
  PluginSubagentOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentOverview() {
  return get<PluginSubagentOverview>('/plugin-subagents/overview')
}

export function getPluginSubagent(sessionId: string) {
  return get<PluginSubagentDetail>(`/plugin-subagents/${sessionId}`)
}
