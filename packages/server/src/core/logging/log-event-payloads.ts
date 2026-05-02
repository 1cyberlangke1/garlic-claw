import type { JsonObject, PluginActionName, PluginEventLevel, PluginLlmPreference } from '@garlic-claw/shared';

export interface LogEventPayload<TType extends string = string> {
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
  type: TType;
}

export type McpGovernanceAction = 'health-check' | 'reconnect' | 'reload';
export type McpLogEventType = 'connection:connected' | 'connection:error' | 'tool:error' | `governance:${McpGovernanceAction}`;
export type PluginLogEventType =
  | 'plugin:config.updated'
  | 'plugin:deleted'
  | 'plugin:event-log.updated'
  | 'plugin:llm-preference.updated'
  | 'plugin:scope.updated'
  | 'plugin:storage.deleted'
  | 'plugin:storage.updated'
  | `governance:${PluginActionName}`;
export type SkillLogEventType = 'governance:updated' | 'skill:load-blocked' | 'skill:loaded';

export function createMcpConnectionConnectedEvent(name: string, toolCount: number): LogEventPayload<Extract<McpLogEventType, 'connection:connected'>> {
  return { level: 'info', message: `MCP 服务器 ${name} 已连接`, metadata: { toolCount }, type: 'connection:connected' };
}

export function createMcpConnectionErrorEvent(message: string): LogEventPayload<Extract<McpLogEventType, 'connection:error'>> {
  return { level: 'error', message, type: 'connection:error' };
}

export function createMcpGovernanceEvent(action: McpGovernanceAction, message: string, metadata?: JsonObject, level: PluginEventLevel = 'info'): LogEventPayload<Extract<McpLogEventType, `governance:${McpGovernanceAction}`>> {
  return { level, message, ...(metadata ? { metadata } : {}), type: `governance:${action}` };
}

export function createMcpToolErrorEvent(message: string, toolName: string): LogEventPayload<Extract<McpLogEventType, 'tool:error'>> {
  return { level: 'error', message, metadata: { toolName }, type: 'tool:error' };
}

export function createPluginConfigUpdatedEvent(pluginId: string, keys: string[]): LogEventPayload<Extract<PluginLogEventType, 'plugin:config.updated'>> {
  return { level: 'info', message: `插件 ${pluginId} 的配置已更新`, metadata: { keys }, type: 'plugin:config.updated' };
}

export function createPluginDeletedEvent(pluginId: string): LogEventPayload<Extract<PluginLogEventType, 'plugin:deleted'>> {
  return { level: 'warn', message: `插件 ${pluginId} 已删除`, type: 'plugin:deleted' };
}

export function createPluginEventLogUpdatedEvent(pluginId: string, maxFileSizeMb: number): LogEventPayload<Extract<PluginLogEventType, 'plugin:event-log.updated'>> {
  return { level: 'info', message: `插件 ${pluginId} 的事件日志设置已更新`, metadata: { maxFileSizeMb }, type: 'plugin:event-log.updated' };
}

export function createPluginGovernanceEvent(action: PluginActionName, message: string, level: PluginEventLevel = 'info'): LogEventPayload<Extract<PluginLogEventType, `governance:${PluginActionName}`>> {
  return { level, message, type: `governance:${action}` };
}

export function createPluginLlmPreferenceUpdatedEvent(pluginId: string, preference: PluginLlmPreference): LogEventPayload<Extract<PluginLogEventType, 'plugin:llm-preference.updated'>> {
  return { level: 'info', message: `插件 ${pluginId} 的 LLM 偏好设置已更新`, metadata: { mode: preference.mode, modelId: preference.modelId, providerId: preference.providerId }, type: 'plugin:llm-preference.updated' };
}

export function createPluginScopeUpdatedEvent(pluginId: string, conversationCount: number): LogEventPayload<Extract<PluginLogEventType, 'plugin:scope.updated'>> {
  return { level: 'info', message: `插件 ${pluginId} 的作用域已更新`, metadata: { conversationCount }, type: 'plugin:scope.updated' };
}

export function createPluginStorageDeletedEvent(key: string): LogEventPayload<Extract<PluginLogEventType, 'plugin:storage.deleted'>> {
  return { level: 'info', message: `插件存储键 ${key} 已删除`, metadata: { key }, type: 'plugin:storage.deleted' };
}

export function createPluginStorageUpdatedEvent(key: string): LogEventPayload<Extract<PluginLogEventType, 'plugin:storage.updated'>> {
  return { level: 'info', message: `插件存储键 ${key} 已更新`, metadata: { key }, type: 'plugin:storage.updated' };
}

export function createSkillGovernanceUpdatedEvent(skillName: string, loadPolicy: string, maxFileSizeMb: number): LogEventPayload<Extract<SkillLogEventType, 'governance:updated'>> {
  return { level: 'info', message: `技能 ${skillName} 的治理设置已更新`, metadata: { loadPolicy, maxFileSizeMb }, type: 'governance:updated' };
}

export function createSkillLoadBlockedEvent(message: string, skillName: string): LogEventPayload<Extract<SkillLogEventType, 'skill:load-blocked'>> {
  return { level: 'warn', message, metadata: { skillName }, type: 'skill:load-blocked' };
}

export function createSkillLoadedEvent(skillName: string, entryPath: string): LogEventPayload<Extract<SkillLogEventType, 'skill:loaded'>> {
  return { level: 'info', message: `技能 ${skillName} 已加载`, metadata: { entryPath }, type: 'skill:loaded' };
}
