import { request } from '@/api/base'
import type {
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentTaskOverview() {
  return request<PluginSubagentTaskOverview>('/plugin-subagent-tasks/overview')
}

export function getPluginSubagentTask(taskId: string) {
  return request<PluginSubagentTaskDetail>(`/plugin-subagent-tasks/${taskId}`)
}
