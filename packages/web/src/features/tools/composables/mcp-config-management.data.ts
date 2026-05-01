import type {
  EventLogListResult,
  EventLogQuery,
  McpConfigSnapshot,
  McpServerConfig,
} from '@garlic-claw/shared'
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServerEvents,
  listMcpServers,
  updateMcpServer,
} from '@/features/tools/api/mcp'
import { getErrorMessage } from '@/utils/error'

/**
 * 读取当前 MCP 配置快照。
 * @returns MCP 配置快照
 */
export function loadMcpConfigSnapshot(): Promise<McpConfigSnapshot> {
  return listMcpServers()
}

/**
 * 创建 MCP server 配置。
 * @param input 新 server 配置
 * @returns 保存后的 server
 */
export function createMcpServerConfig(input: McpServerConfig) {
  return createMcpServer(input)
}

/**
 * 更新 MCP server 配置。
 * @param currentName 原 server 名称
 * @param input 更新后的 server 配置
 * @returns 保存后的 server
 */
export function updateMcpServerConfig(
  currentName: string,
  input: McpServerConfig,
) {
  return updateMcpServer(currentName, input)
}

/**
 * 删除 MCP server 配置。
 * @param name server 名称
 * @returns 删除结果
 */
export function deleteMcpServerConfig(name: string) {
  return deleteMcpServer(name)
}

/**
 * 读取 MCP server 最近事件日志。
 * @param name server 名称
 * @param query 查询条件
 * @returns 事件日志结果
 */
export function loadMcpServerEvents(
  name: string,
  query: EventLogQuery,
): Promise<EventLogListResult> {
  return listMcpServerEvents(name, normalizeMcpEventQuery(query))
}

export function normalizeMcpEventQuery(query: EventLogQuery): EventLogQuery {
  return {
    limit: Math.min(200, Math.max(1, query.limit ?? 50)),
    ...(query.cursor?.trim() ? { cursor: query.cursor.trim() } : {}),
    ...(query.level ? { level: query.level } : {}),
    ...(query.type?.trim() ? { type: query.type.trim() } : {}),
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
  }
}

export function dedupeMcpEventLogs(events: EventLogListResult['items']) {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false
    }
    seen.add(event.id)
    return true
  })
}

/**
 * 统一转换 MCP 管理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
