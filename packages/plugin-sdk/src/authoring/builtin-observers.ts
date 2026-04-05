import type {
  AutomationAfterRunHookPayload,
  ChatWaitingModelHookPayload,
  ConversationCreatedHookPayload,
  JsonObject,
  JsonValue,
  MessageReceivedHookPayload,
  PluginEventLevel,
  PluginManifest,
  PluginMessageHookInfo,
  ResponseAfterSendHookPayload,
  ToolAfterCallHookPayload,
} from '@garlic-claw/shared';

const AUTOMATION_RECORDER_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'automation:after-run',
    description: '在自动化执行完成后记录执行摘要',
  },
];

export const AUTOMATION_RECORDER_MANIFEST: PluginManifest = {
  id: 'builtin.automation-recorder',
  name: '自动化记录器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证自动化生命周期 Hook 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: AUTOMATION_RECORDER_MANIFEST_HOOKS,
};

const MESSAGE_ENTRY_RECORDER_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'message:received',
    description: '在命令式消息进入 LLM 前记录摘要',
    priority: 100,
    filter: {
      message: {
        regex: '^/',
      },
    },
  },
  {
    name: 'chat:waiting-model',
    description: '在真正进入模型调用前记录 waiting 摘要',
  },
];

export const MESSAGE_ENTRY_RECORDER_MANIFEST: PluginManifest = {
  id: 'builtin.message-entry-recorder',
  name: '消息入口记录器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证 message:received 与 chat:waiting-model 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: MESSAGE_ENTRY_RECORDER_MANIFEST_HOOKS,
};

const MESSAGE_LIFECYCLE_RECORDER_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'conversation:created',
    description: '在新会话创建后记录会话摘要',
  },
  {
    name: 'message:created',
    description: '在消息创建后记录消息摘要',
  },
  {
    name: 'message:updated',
    description: '在消息更新后记录消息摘要',
  },
  {
    name: 'message:deleted',
    description: '在消息删除后记录消息摘要',
  },
];

export const MESSAGE_LIFECYCLE_RECORDER_MANIFEST: PluginManifest = {
  id: 'builtin.message-lifecycle-recorder',
  name: '消息生命周期记录器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证会话与消息生命周期 Hook 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: MESSAGE_LIFECYCLE_RECORDER_MANIFEST_HOOKS,
};

const RESPONSE_RECORDER_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'response:after-send',
    description: '在最终回复发送后记录发送摘要',
  },
];

export const RESPONSE_RECORDER_MANIFEST: PluginManifest = {
  id: 'builtin.response-recorder',
  name: '回复记录器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证最终回复发送 Hook 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: RESPONSE_RECORDER_MANIFEST_HOOKS,
};

const PLUGIN_GOVERNANCE_RECORDER_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'plugin:loaded',
    description: '在插件加载后记录治理摘要',
  },
  {
    name: 'plugin:unloaded',
    description: '在插件卸载后记录治理摘要',
  },
  {
    name: 'plugin:error',
    description: '在插件失败后记录治理摘要',
  },
];

export const PLUGIN_GOVERNANCE_RECORDER_MANIFEST: PluginManifest = {
  id: 'builtin.plugin-governance-recorder',
  name: '插件治理记录器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证插件治理生命周期 Hook 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: PLUGIN_GOVERNANCE_RECORDER_MANIFEST_HOOKS,
};

const TOOL_AUDIT_MANIFEST_HOOKS: NonNullable<PluginManifest['hooks']> = [
  {
    name: 'tool:after-call',
    description: '在工具执行完成后记录调用摘要',
  },
];

export const TOOL_AUDIT_MANIFEST: PluginManifest = {
  id: 'builtin.tool-audit',
  name: '工具审计器',
  version: '1.0.0',
  runtime: 'builtin',
  description: '用于验证工具生命周期 Hook 链路的内建插件',
  permissions: ['log:write', 'storage:write'],
  tools: [],
  hooks: TOOL_AUDIT_MANIFEST_HOOKS,
};

export interface PluginAutomationRunSummary extends JsonObject {
  automationId: string;
  automationName: string;
  status: string;
  triggerType: string;
  resultCount: number;
}

export interface PluginMessageReceivedSummary extends JsonObject {
  conversationId: string;
  providerId: string;
  modelId: string;
  contentLength: number;
  partsCount: number;
  userId: string | null;
}

export interface PluginWaitingModelSummary extends JsonObject {
  conversationId: string;
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  messageCount: number;
  toolCount: number;
  userId: string | null;
}

export interface PluginConversationCreatedSummary extends JsonObject {
  conversationId: string;
  titleLength: number;
  userId: string | null;
}

export interface PluginMessageLifecycleSummary extends JsonObject {
  eventType: string;
  conversationId: string;
  messageId: string | null;
  role: string;
  contentLength: number;
  partsCount: number;
  status: string | null;
  userId: string | null;
}

export interface PluginResponseSendSummary extends JsonObject {
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  responseSource: string;
  contentLength: number;
  toolCallCount: number;
  toolResultCount: number;
  sentAt: string;
  userId: string | null;
  conversationId: string | null;
}

export interface PluginGovernanceSummary extends JsonObject {
  eventType: string;
  pluginId: string;
  runtimeKind: string;
  deviceType: string;
  errorType: string | null;
  errorMessage: string | null;
  occurredAt: string;
}

export interface PluginToolAuditSummary extends JsonObject {
  sourceKind: string;
  sourceId: string;
  pluginId: string | null;
  runtimeKind: string | null;
  toolId: string;
  callName: string;
  toolName: string;
  callSource: string;
  paramKeys: string[];
  outputKind: string;
  userId: string | null;
  conversationId: string | null;
}

export interface PluginObservationHost {
  setStorage(key: string, value: JsonValue): Promise<JsonValue>;
  writeLog(input: {
    level: PluginEventLevel;
    type?: string;
    message: string;
    metadata?: JsonObject;
  }): Promise<boolean>;
}

export async function persistPluginObservation<TSummary extends JsonObject>(
  host: PluginObservationHost,
  storageKey: string,
  summary: TSummary,
  level: PluginEventLevel,
  message: string,
  type?: string,
  metadata?: JsonObject,
): Promise<void> {
  await host.setStorage(storageKey, summary);
  await host.writeLog({
    level,
    ...(type ? { type } : {}),
    message,
    metadata: metadata ?? summary,
  });
}

export function buildAutomationRunSummary(
  payload: AutomationAfterRunHookPayload,
): PluginAutomationRunSummary {
  return {
    automationId: payload.automation.id,
    automationName: payload.automation.name,
    status: payload.status,
    triggerType: payload.automation.trigger.type,
    resultCount: payload.results.length,
  };
}

export function buildMessageReceivedSummary(
  payload: MessageReceivedHookPayload,
): PluginMessageReceivedSummary {
  return {
    conversationId: payload.conversationId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    contentLength: payload.message.content?.length ?? 0,
    partsCount: payload.message.parts.length,
    userId: payload.context.userId ?? null,
  };
}

export function buildWaitingModelSummary(
  payload: ChatWaitingModelHookPayload,
): PluginWaitingModelSummary {
  return {
    conversationId: payload.conversationId,
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    messageCount: payload.request.messages.length,
    toolCount: payload.request.availableTools.length,
    userId: payload.context.userId ?? null,
  };
}

export function buildConversationCreatedSummary(
  payload: ConversationCreatedHookPayload,
): PluginConversationCreatedSummary {
  return {
    conversationId: payload.conversation.id,
    titleLength: payload.conversation.title.length,
    userId: payload.context.userId ?? null,
  };
}

export function buildMessageLifecycleSummary(
  eventType: string,
  conversationId: string,
  message: Pick<PluginMessageHookInfo, 'id' | 'role' | 'content' | 'parts' | 'status'>,
  userId: string | null,
): PluginMessageLifecycleSummary {
  return {
    eventType,
    conversationId,
    messageId: message.id ?? null,
    role: message.role,
    contentLength: message.content?.length ?? 0,
    partsCount: message.parts.length,
    status: message.status ?? null,
    userId,
  };
}

export function buildResponseSendSummary(
  payload: ResponseAfterSendHookPayload,
): PluginResponseSendSummary {
  return {
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    responseSource: payload.responseSource,
    contentLength: payload.assistantContent.length,
    toolCallCount: payload.toolCalls.length,
    toolResultCount: payload.toolResults.length,
    sentAt: payload.sentAt,
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };
}

export function buildPluginGovernanceSummary(input: {
  eventType: string;
  pluginId: string;
  runtimeKind: string;
  deviceType: string;
  occurredAt: string;
  errorType?: string;
  errorMessage?: string;
}): PluginGovernanceSummary {
  return {
    eventType: input.eventType,
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
    deviceType: input.deviceType,
    errorType: input.errorType ?? null,
    errorMessage: input.errorMessage ?? null,
    occurredAt: input.occurredAt,
  };
}

export function buildPluginGovernanceMessage(
  summary: PluginGovernanceSummary,
): string {
  if (summary.eventType === 'plugin:error') {
    return `插件 ${summary.pluginId} 发生失败：${summary.errorType ?? 'unknown'}`;
  }
  if (summary.eventType === 'plugin:unloaded') {
    return `插件 ${summary.pluginId} 已卸载`;
  }

  return `插件 ${summary.pluginId} 已加载`;
}

export function buildToolAuditSummary(
  payload: ToolAfterCallHookPayload,
): PluginToolAuditSummary {
  return {
    sourceKind: payload.source.kind,
    sourceId: payload.source.id,
    pluginId: payload.pluginId ?? null,
    runtimeKind: payload.runtimeKind ?? null,
    toolId: payload.tool.toolId,
    callName: payload.tool.callName,
    toolName: payload.tool.name,
    callSource: payload.context.source,
    paramKeys: Object.keys(payload.params),
    outputKind: describeJsonValueKind(payload.output),
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };
}

export function describeJsonValueKind(value: JsonValue): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }

  return typeof value;
}

export function buildToolAuditStorageKey(
  payload: Pick<ToolAfterCallHookPayload, 'source' | 'pluginId' | 'tool'>,
): string {
  const storageScope = payload.source.kind === 'plugin'
    ? payload.pluginId ?? payload.source.id
    : `${payload.source.kind}.${payload.source.id}`;

  return `tool.${storageScope}.${payload.tool.name}.last-call`;
}
