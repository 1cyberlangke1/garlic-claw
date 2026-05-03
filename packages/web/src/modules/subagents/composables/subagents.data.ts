import type {
  PluginSubagentDetail,
  PluginSubagentSummary,
} from '@garlic-claw/shared'
import {
  closeSubagent,
  listSubagentOverview,
} from '@/modules/subagents/api/subagents'
import { getErrorMessage } from '@/shared/utils/error'

export interface PluginSubagentOverviewData {
  subagents: PluginSubagentSummary[]
}

/**
 * 读取后台子代理总览。
 * @returns 子代理列表
 */
export function loadPluginSubagentOverview(): Promise<PluginSubagentOverviewData> {
  return listSubagentOverview()
}

/**
 * 关闭后台子代理会话。
 * @param conversationId 子代理会话 ID
 * @returns 关闭后的子代理详情
 */
export function closePluginSubagentConversation(conversationId: string): Promise<PluginSubagentDetail> {
  return closeSubagent(conversationId)
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
