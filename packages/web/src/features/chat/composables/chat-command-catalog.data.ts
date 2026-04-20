import type { PluginCommandCatalogVersion, PluginCommandOverview } from '@garlic-claw/shared'
import {
  getPluginCommandCatalogVersion,
  listPluginCommandOverview,
} from '@/features/commands/api/plugin-commands'

/**
 * 读取聊天命令目录总览。
 * @returns 命令目录与版本
 */
export function loadChatCommandCatalog(): Promise<PluginCommandOverview> {
  return listPluginCommandOverview()
}

/**
 * 读取聊天命令目录版本摘要。
 * @returns 当前命令目录版本
 */
export function loadChatCommandCatalogVersion(): Promise<PluginCommandCatalogVersion> {
  return getPluginCommandCatalogVersion()
}
