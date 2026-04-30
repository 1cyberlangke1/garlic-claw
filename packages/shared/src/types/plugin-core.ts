import type { JsonObject, JsonValue } from './json';

export interface WsMessage<T = JsonValue> {
  type: string;
  action: string;
  payload: T;
  requestId?: string;
}

export type PluginRuntimeKind = 'local' | 'remote';

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
  | 'runtime:command'
  | 'runtime:read'
  | 'runtime:write'
  | 'storage:read'
  | 'storage:write'
  | 'subagent:run'
  | 'state:read'
  | 'state:write'
  | 'user:read';

export type PluginHookName =
  | 'message:received'
  | 'conversation:history-rewrite'
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

export type PluginMessageKind = 'text' | 'image' | 'mixed';

export interface PluginRegexFilterDescriptor {
  pattern: string;
  flags?: string;
}

export interface PluginHookMessageFilter {
  commands?: string[];
  regex?: string | PluginRegexFilterDescriptor;
  messageKinds?: PluginMessageKind[];
}

export interface PluginHookFilterDescriptor {
  message?: PluginHookMessageFilter;
}

export type PluginCommandKind = 'command' | 'group-help' | 'hook-filter';

export interface PluginCommandDescriptor {
  kind: PluginCommandKind;
  canonicalCommand: string;
  path: string[];
  aliases: string[];
  variants: string[];
  description?: string;
  priority?: number;
}

export type PluginInvocationSource =
  | 'chat-tool'
  | 'chat-hook'
  | 'cron'
  | 'automation'
  | 'http-route'
  | 'subagent'
  | 'plugin';

export type PluginActionName =
  | 'reload'
  | 'reconnect'
  | 'health-check'
  | 'refresh-metadata';

export interface PluginParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
}

export type PluginRemoteEnvironment = 'api' | 'iot';

export type PluginAuthMode = 'none' | 'optional' | 'required';

export type PluginCapabilityProfile = 'query' | 'actuate' | 'hybrid';

export interface PluginRemoteAuthDescriptor {
  mode: PluginAuthMode;
}

export interface PluginRemoteDescriptor {
  remoteEnvironment: PluginRemoteEnvironment;
  auth: PluginRemoteAuthDescriptor;
  capabilityProfile: PluginCapabilityProfile;
}

export interface PluginRemoteAccessConfig {
  serverUrl: string | null;
  accessKey: string | null;
}

export interface PluginRemoteMetadataCacheInfo {
  status: 'empty' | 'cached';
  lastSyncedAt: string | null;
  manifestHash: string | null;
}

export interface AuthPayload {
  accessKey?: string | null;
  pluginName: string;
  remoteEnvironment: PluginRemoteEnvironment;
}

export interface RemotePluginConnectionInfo {
  pluginName: string;
  remote: PluginRemoteDescriptor;
  serverUrl: string;
  accessKey: string | null;
}

export interface PluginHookDescriptor {
  name: PluginHookName;
  description?: string;
  priority?: number;
  filter?: PluginHookFilterDescriptor;
}

export type PluginConfigNodeType =
  | 'string'
  | 'text'
  | 'int'
  | 'float'
  | 'bool'
  | 'object'
  | 'list';

export type PluginConfigConditionValue = boolean | null | number | string;

export type PluginConfigRenderType = 'checkbox' | 'select';

export type PluginConfigSpecialType =
  | 'selectProvider'
  | 'selectProviders'
  | 'selectPersona'
  | 'selectSubagentType'
  | 'personaPool'
  | (string & {});

export interface PluginConfigOptionSchema {
  value: string;
  label?: string;
  description?: string;
}

export interface PluginConfigBaseSchema {
  type: PluginConfigNodeType;
  description?: string;
  hint?: string;
  obviousHint?: boolean;
  defaultValue?: JsonValue;
  invisible?: boolean;
  options?: PluginConfigOptionSchema[];
  condition?: Record<string, PluginConfigConditionValue>;
  collapsed?: boolean;
  renderType?: PluginConfigRenderType;
  editorMode?: boolean;
  editorLanguage?: string;
  editorTheme?: string;
  specialType?: PluginConfigSpecialType;
  secret?: boolean;
}

export interface PluginConfigStringSchema extends PluginConfigBaseSchema {
  type: 'string' | 'text';
}

export interface PluginConfigNumberSchema extends PluginConfigBaseSchema {
  type: 'int' | 'float';
}

export interface PluginConfigBooleanSchema extends PluginConfigBaseSchema {
  type: 'bool';
}

export interface PluginConfigListSchema extends PluginConfigBaseSchema {
  type: 'list';
  items?: PluginConfigNodeSchema;
}

export interface PluginConfigObjectSchema extends PluginConfigBaseSchema {
  type: 'object';
  items: Record<string, PluginConfigNodeSchema>;
}

export type PluginConfigNodeSchema =
  | PluginConfigBooleanSchema
  | PluginConfigListSchema
  | PluginConfigNumberSchema
  | PluginConfigObjectSchema
  | PluginConfigStringSchema;

export type PluginConfigSchema = PluginConfigObjectSchema;

export interface PluginConfigNodeSnapshot {
  path: string;
  schema: PluginConfigNodeSchema;
  value: JsonValue | undefined;
}

export interface PluginConfigSnapshot {
  schema: PluginConfigSchema | null;
  values: JsonObject;
}

export type PluginLlmPreferenceMode = 'inherit' | 'override';

export interface PluginLlmPreference {
  mode: PluginLlmPreferenceMode;
  providerId: string | null;
  modelId: string | null;
}

export interface PluginScopeSettings {
  defaultEnabled: boolean;
  conversations: Record<string, boolean>;
}

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
