import { get, post } from '@/shared/api/http'
import type {
  PluginSubagentDetail,
  PluginSubagentOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentOverview() {
  return get<PluginSubagentOverview>('/subagents/overview')
}

export function closePluginSubagent(conversationId: string) {
  return post<PluginSubagentDetail>(`/subagents/${conversationId}/close`)
}

export const listSubagentOverview = listPluginSubagentOverview
export const closeSubagent = closePluginSubagent
