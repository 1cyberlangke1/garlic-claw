import { delete as del, get } from '@/api/http'
import type {
  PluginSubagentDetail,
  PluginSubagentOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentOverview() {
  return get<PluginSubagentOverview>('/subagents/overview')
}

export function getPluginSubagent(sessionId: string) {
  return get<PluginSubagentDetail>(`/subagents/${sessionId}`)
}

export function removePluginSubagent(sessionId: string) {
  return del<boolean>(`/subagents/${sessionId}`)
}

export const listSubagentOverview = listPluginSubagentOverview
export const getSubagent = getPluginSubagent
export const removeSubagent = removePluginSubagent
