import type {
  PluginSubagentDetail,
  PluginSubagentSummary,
} from '@garlic-claw/shared'
import {
  getSubagent,
  listSubagentOverview,
  removeSubagent,
} from '@/features/subagents/api/subagents'
import { getErrorMessage } from '@/utils/error'

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
 * 读取单个后台子代理详情。
 * @param sessionId 子代理 session ID
 * @returns 子代理详情
 */
export function loadPluginSubagentDetail(sessionId: string): Promise<PluginSubagentDetail> {
  return getSubagent(sessionId)
}

/**
 * 移除后台子代理会话。
 * @param sessionId 子代理 session ID
 * @returns 是否成功移除
 */
export function removePluginSubagentSession(sessionId: string): Promise<boolean> {
  return removeSubagent(sessionId)
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
