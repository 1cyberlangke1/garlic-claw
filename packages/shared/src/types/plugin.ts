import type { PluginMessageTargetInfo, PluginMessageTargetRef } from './plugin-chat';
import type { PluginCronDescriptor, PluginCronJobSummary } from './plugin-cron';
import type { JsonObject, JsonValue } from './json';
import type {
  PluginSubagentRequest,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  PluginSubagentTaskStatus,
  PluginSubagentTaskWriteBackStatus,
} from './plugin-ai';
import type { PluginRouteDescriptor } from './plugin-route';
export type {
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPassResult,
  ChatAfterModelHookPayload,
  ChatAfterModelHookResult,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookResult,
  ChatBeforeModelHookShortCircuitResult,
  ChatBeforeModelRequest,
  ChatWaitingModelHookPayload,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPassResult,
  MessageReceivedHookPayload,
  MessageReceivedHookResult,
  MessageReceivedHookShortCircuitResult,
  PluginAvailableToolSummary,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginLlmMessage,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginSubagentRequest,
  PluginSubagentRunParams,
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPassResult,
  SubagentAfterRunHookPayload,
  SubagentAfterRunHookResult,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPassResult,
  SubagentBeforeRunHookPayload,
  SubagentBeforeRunHookResult,
  SubagentBeforeRunHookShortCircuitResult,
  PluginSubagentRunResult,
  PluginSubagentTaskStatus,
  PluginSubagentTaskWriteBackStatus,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
} from './plugin-ai';
export type {
  ConversationCreatedHookPayload,
  MessageCreatedHookMutateResult,
  MessageCreatedHookPayload,
  MessageCreatedHookResult,
  MessageDeletedHookPayload,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookPayload,
  MessageUpdatedHookResult,
  PluginConversationHookInfo,
  PluginConversationSessionInfo,
  PluginConversationSessionKeepParams,
  PluginConversationSessionStartParams,
  PluginMessageHookInfo,
  PluginMessageSendInfo,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
  PluginMessageTargetType,
} from './plugin-chat';
export type {
  PluginErrorHookPayload,
  PluginLifecycleHookInfo,
  PluginLoadedHookPayload,
  PluginUnloadedHookPayload,
} from './plugin-lifecycle';
export type {
  HostCallPayload,
  HostResultPayload,
  PluginHostMethod,
} from './plugin-host';
export {
  CONNECTION_SCOPED_PLUGIN_HOST_METHODS,
  PLUGIN_HOST_METHOD_PERMISSION_MAP,
  PLUGIN_HOST_METHOD_VALUES,
} from './plugin-host';
export type {
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginCronSource,
  PluginCronTickPayload,
} from './plugin-cron';
export type {
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPassResult,
  AutomationAfterRunHookPayload,
  AutomationAfterRunHookResult,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPassResult,
  AutomationBeforeRunHookPayload,
  AutomationBeforeRunHookResult,
  AutomationBeforeRunHookShortCircuitResult,
  PluginResponseSource,
  ResponseAfterSendHookPayload,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPassResult,
  ResponseBeforeSendHookPayload,
  ResponseBeforeSendHookResult,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPassResult,
  ToolAfterCallHookPayload,
  ToolAfterCallHookResult,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPassResult,
  ToolBeforeCallHookPayload,
  ToolBeforeCallHookResult,
  ToolBeforeCallHookShortCircuitResult,
  ToolHookSourceInfo,
  ToolHookToolInfo,
} from './plugin-operation';
export type {
  PluginRouteDescriptor,
  PluginRouteMethod,
  PluginRouteRequest,
  PluginRouteResponse,
  RouteInvokePayload,
  RouteResultPayload,
} from './plugin-route';
export { PLUGIN_ROUTE_METHOD_VALUES } from './plugin-route';

/** WebSocket 消息信封 */
export interface WsMessage<T = JsonValue> {
  type: string;
  action: string;
  payload: T;
  requestId?: string;
}

/** 插件运行时类型。 */
export type PluginRuntimeKind = 'builtin' | 'remote';

/** 插件权限。 */
export type PluginPermission =
  | 'automation:read'
  | 'automation:write'
  | 'cron:read'
  | 'cron:write'
  | 'conversation:read'
  | 'conversation:write'
  | 'config:read'
  | 'kb:read'
  | 'log:read'
  | 'llm:generate'
  | 'log:write'
  | 'memory:read'
  | 'memory:write'
  | 'persona:read'
  | 'persona:write'
  | 'provider:read'
  | 'storage:read'
  | 'storage:write'
  | 'subagent:run'
  | 'state:read'
  | 'state:write'
  | 'user:read';

/** 插件 Hook 名称。 */
export type PluginHookName =
  | 'message:received'
  | 'chat:before-model'
  | 'chat:waiting-model'
  | 'chat:after-model'
  | 'conversation:created'
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  | 'automation:before-run'
  | 'automation:after-run'
  | 'subagent:before-run'
  | 'subagent:after-run'
  | 'tool:before-call'
  | 'tool:after-call'
  | 'response:before-send'
  | 'response:after-send'
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'plugin:error'
  | 'cron:tick';

export const PLUGIN_HOOK_NAME_VALUES = [
  'message:received',
  'chat:before-model',
  'chat:waiting-model',
  'chat:after-model',
  'conversation:created',
  'message:created',
  'message:updated',
  'message:deleted',
  'automation:before-run',
  'automation:after-run',
  'subagent:before-run',
  'subagent:after-run',
  'tool:before-call',
  'tool:after-call',
  'response:before-send',
  'response:after-send',
  'plugin:loaded',
  'plugin:unloaded',
  'plugin:error',
  'cron:tick',
] as const satisfies PluginHookName[];

/** `message:received` 可声明的消息类型过滤。 */
export type PluginMessageKind = 'text' | 'image' | 'mixed';

export const PLUGIN_MESSAGE_KIND_VALUES = [
  'text',
  'image',
  'mixed',
] as const satisfies PluginMessageKind[];

/** 正则过滤描述。 */
export interface PluginRegexFilterDescriptor {
  pattern: string;
  flags?: string;
}

/** `message:received` 的最小声明式过滤条件。 */
export interface PluginHookMessageFilter {
  commands?: string[];
  regex?: string | PluginRegexFilterDescriptor;
  messageKinds?: PluginMessageKind[];
}

/** Hook 过滤描述。 */
export interface PluginHookFilterDescriptor {
  message?: PluginHookMessageFilter;
}

/** 命令治理视角下的命令类型。 */
export type PluginCommandKind = 'command' | 'group-help' | 'hook-filter';

export const PLUGIN_MANIFEST_COMMAND_KIND_VALUES = [
  'command',
  'group-help',
] as const satisfies Array<Exclude<PluginCommandKind, 'hook-filter'>>;

/** 插件对外暴露的命令描述。 */
export interface PluginCommandDescriptor {
  kind: PluginCommandKind;
  canonicalCommand: string;
  path: string[];
  aliases: string[];
  variants: string[];
  description?: string;
  priority?: number;
}

/** 插件调用来源。 */
export type PluginInvocationSource =
  | 'chat-tool'
  | 'chat-hook'
  | 'cron'
  | 'automation'
  | 'http-route'
  | 'subagent'
  | 'plugin';

export const PLUGIN_INVOCATION_SOURCE_VALUES = [
  'chat-tool',
  'chat-hook',
  'cron',
  'automation',
  'http-route',
  'subagent',
  'plugin',
] as const satisfies PluginInvocationSource[];

// ---- WebSocket 消息类型 (type 字段) ----
export const WS_TYPE = {
  AUTH: 'auth',
  PLUGIN: 'plugin',
  COMMAND: 'command',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
} as const;

// ---- WebSocket 动作 (action 字段) ----
export const WS_ACTION = {
  // 认证
  AUTHENTICATE: 'authenticate',
  AUTH_OK: 'auth_ok',
  AUTH_FAIL: 'auth_fail',
  // 插件生命周期
  REGISTER: 'register',
  REGISTER_OK: 'register_ok',
  UNREGISTER: 'unregister',
  STATUS: 'status',
  // 命令 (AI → 插件)
  EXECUTE: 'execute',
  EXECUTE_RESULT: 'execute_result',
  EXECUTE_ERROR: 'execute_error',
  // Hook (Host → 插件)
  HOOK_INVOKE: 'hook_invoke',
  HOOK_RESULT: 'hook_result',
  HOOK_ERROR: 'hook_error',
  // Route (HTTP → 插件)
  ROUTE_INVOKE: 'route_invoke',
  ROUTE_RESULT: 'route_result',
  ROUTE_ERROR: 'route_error',
  // Host API (插件 → Host)
  HOST_CALL: 'host_call',
  HOST_RESULT: 'host_result',
  HOST_ERROR: 'host_error',
  // 心跳
  PING: 'ping',
  PONG: 'pong',
} as const;

// ---- 负载类型 ----
export interface AuthPayload {
  token: string;
  pluginName: string;
  deviceType: DeviceType;
}

/** 远程插件在线接入时返回给作者侧的连接信息。 */
export interface RemotePluginBootstrapInfo {
  pluginName: string;
  deviceType: DeviceType;
  serverUrl: string;
  token: string;
  tokenExpiresIn: string;
}

/** 插件 Hook 描述。 */
export interface PluginHookDescriptor {
  name: PluginHookName;
  description?: string;
  priority?: number;
  filter?: PluginHookFilterDescriptor;
}

/** 插件配置字段描述。 */
export interface PluginConfigFieldSchema {
  key: string;
  type: PluginParamSchema['type'];
  description?: string;
  required?: boolean;
  secret?: boolean;
  defaultValue?: JsonValue;
}

/** 插件配置 schema。 */
export interface PluginConfigSchema {
  fields: PluginConfigFieldSchema[];
}

/** 插件配置快照。 */
export interface PluginConfigSnapshot {
  schema: PluginConfigSchema | null;
  values: JsonObject;
}

/** 插件作用域设置。 */
export interface PluginScopeSettings {
  defaultEnabled: boolean;
  conversations: Record<string, boolean>;
}

/** 插件健康状态。 */
export type PluginHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'error'
  | 'offline';

/** 插件事件日志级别。 */
export type PluginEventLevel = 'info' | 'warn' | 'error';

/** 插件治理动作名称。 */
export type PluginActionName = 'reload' | 'reconnect' | 'health-check';

/** 插件运行时压力快照。 */
export interface PluginRuntimePressureSnapshot {
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

/** 插件健康快照。 */
export interface PluginHealthSnapshot {
  status: PluginHealthStatus;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  runtimePressure?: PluginRuntimePressureSnapshot;
}

/** 插件事件日志记录。 */
export interface PluginEventRecord {
  id: string;
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata: JsonObject | null;
  createdAt: string;
}

/** 插件事件日志查询条件。 */
export interface PluginEventQuery {
  limit?: number;
  level?: PluginEventLevel;
  type?: string;
  keyword?: string;
  cursor?: string;
}

/** 插件事件日志分页结果。 */
export interface PluginEventListResult {
  items: PluginEventRecord[];
  nextCursor: string | null;
}

/** 插件持久化 KV 条目。 */
export interface PluginStorageEntry {
  key: string;
  value: JsonValue;
}

/** 插件私有状态/存储可绑定的宿主作用域。 */
export type PluginScopedStateScope = 'plugin' | 'conversation' | 'user';

/** 插件自省信息。 */
export interface PluginSelfInfo {
  id: string;
  name: string;
  runtimeKind: PluginRuntimeKind;
  version?: string;
  description?: string;
  permissions: PluginPermission[];
  crons?: PluginCronDescriptor[];
  commands?: PluginCommandDescriptor[];
  hooks?: PluginHookDescriptor[];
  routes?: PluginRouteDescriptor[];
  supportedActions?: PluginActionName[];
}

/** 插件治理动作执行结果。 */
export interface PluginActionResult {
  accepted: boolean;
  action: PluginActionName;
  pluginId: string;
  message: string;
}

/** 插件清单。 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntimeKind;
  description?: string;
  permissions: PluginPermission[];
  tools: PluginCapability[];
  crons?: PluginCronDescriptor[];
  commands?: PluginCommandDescriptor[];
  hooks?: PluginHookDescriptor[];
  config?: PluginConfigSchema;
  routes?: PluginRouteDescriptor[];
}

export interface RegisterPayload {
  manifest: PluginManifest;
}

export interface ExecutePayload {
  capability?: string;
  toolName?: string;
  params: JsonObject;
  context?: PluginCallContext;
}

export interface ExecuteResultPayload {
  data: JsonValue;
}

export interface ExecuteErrorPayload {
  error: string;
}

/** 插件调用上下文。 */
export interface PluginCallContext {
  source: PluginInvocationSource;
  userId?: string;
  conversationId?: string;
  automationId?: string;
  cronJobId?: string;
  activeProviderId?: string;
  activeModelId?: string;
  activePersonaId?: string;
  metadata?: JsonObject;
}

/** 插件可见的人设安全摘要。 */
export interface PluginPersonaSummary {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 插件可见的当前人设上下文摘要。 */
export interface PluginPersonaCurrentInfo {
  source: 'context' | 'conversation' | 'default';
  personaId: string;
  name: string;
  prompt: string;
  description?: string;
  isDefault: boolean;
}

/** 插件可见的知识库条目摘要。 */
export interface PluginKbEntrySummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 插件可见的知识库条目详情。 */
export interface PluginKbEntryDetail extends PluginKbEntrySummary {
  content: string;
}

/** 后台子代理任务回写状态。 */
export interface PluginSubagentTaskWriteBack {
  target?: PluginMessageTargetRef | null;
}

/** 启动后台子代理任务的参数。 */
export interface PluginSubagentTaskStartParams extends PluginSubagentRunParams {
  writeBack?: PluginSubagentTaskWriteBack | null;
}

/** 后台子代理任务摘要。 */
export interface PluginSubagentTaskSummary {
  id: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  status: PluginSubagentTaskStatus;
  requestPreview: string;
  resultPreview?: string;
  providerId?: string;
  modelId?: string;
  error?: string;
  writeBackStatus: PluginSubagentTaskWriteBackStatus;
  writeBackTarget?: PluginMessageTargetInfo | null;
  writeBackError?: string;
  writeBackMessageId?: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  conversationId?: string;
  userId?: string;
}

/** 后台子代理任务详情。 */
export interface PluginSubagentTaskDetail extends PluginSubagentTaskSummary {
  request: PluginSubagentRequest;
  context: PluginCallContext;
  result?: PluginSubagentRunResult | null;
}

/** 后台子代理任务总览。 */
export interface PluginSubagentTaskOverview {
  tasks: PluginSubagentTaskSummary[];
}

/** Hook 调用负载。 */
export interface HookInvokePayload {
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}

/** Hook 返回负载。 */
export interface HookResultPayload {
  data: JsonValue;
}

/** 插件能力描述符 */
export interface PluginCapability {
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
}

/** 内建插件在治理面的角色。 */
export type PluginBuiltinRole =
  | 'user-facing'
  | 'system-optional'
  | 'system-required';

/** 插件治理摘要。 */
export interface PluginGovernanceInfo {
  canDisable: boolean;
  disableReason?: string;
  builtinRole?: PluginBuiltinRole;
}

/** 命令目录的来源。 */
export type PluginCommandDescriptorSource = 'manifest' | 'hook-filter';

/** 插件命令目录里的单条命令记录。 */
export interface PluginCommandInfo extends PluginCommandDescriptor {
  commandId: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  connected: boolean;
  defaultEnabled: boolean;
  source: PluginCommandDescriptorSource;
  governance?: PluginGovernanceInfo;
  conflictTriggers: string[];
}

/** 冲突视图里的命令归属摘要。 */
export interface PluginCommandConflictEntry {
  commandId: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  connected: boolean;
  defaultEnabled: boolean;
  kind: PluginCommandKind;
  canonicalCommand: string;
  priority?: number;
}

/** 一个触发词对应的冲突摘要。 */
export interface PluginCommandConflict {
  trigger: string;
  commands: PluginCommandConflictEntry[];
}

/** 插件命令治理总览。 */
export interface PluginCommandOverview {
  commands: PluginCommandInfo[];
  conflicts: PluginCommandConflict[];
}

/** 插件/设备信息 */
export interface PluginInfo {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deviceType: string;
  status: string;
  connected: boolean;
  runtimeKind?: PluginRuntimeKind;
  version?: string;
  supportedActions?: PluginActionName[];
  crons?: PluginCronJobSummary[];
  manifest: PluginManifest;
  health?: PluginHealthSnapshot;
  governance?: PluginGovernanceInfo;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
}

export enum PluginStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
}

export enum DeviceType {
  BUILTIN = 'builtin',
  PC = 'pc',
  MOBILE = 'mobile',
  IOT = 'iot',
  API = 'api',
}
