import { get, post } from '@/shared/api/http'
import type {
  PluginSubagentDetail,
  PluginSubagentOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentOverview() {
  return get<PluginSubagentOverview>('/subagents/overview')
}

export function getPluginSubagent(conversationId: string) {
  return get<PluginSubagentDetail>(`/subagents/${conversationId}`)
}

export function closePluginSubagent(conversationId: string) {
  return post<PluginSubagentDetail>(`/subagents/${conversationId}/close`)
}

export const listSubagentOverview = listPluginSubagentOverview
export const getSubagent = getPluginSubagent
export const closeSubagent = closePluginSubagent
