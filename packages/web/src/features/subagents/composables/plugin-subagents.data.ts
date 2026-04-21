import type { PluginSubagentSummary } from '@garlic-claw/shared'
import { listPluginSubagentOverview } from '@/features/subagents/api/plugin-subagents'
import { getErrorMessage } from '@/utils/error'

export interface PluginSubagentOverviewData {
  subagents: PluginSubagentSummary[]
}

/**
 * 读取后台子代理总览。
 * @returns 子代理列表
 */
export function loadPluginSubagentOverview(): Promise<PluginSubagentOverviewData> {
  return listPluginSubagentOverview()
}

/**
 * 统一转换后台子代理页面错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
