import type {
  PluginSubagentExecutionResult,
  PluginSubagentRequest,
  PluginSubagentRunParams,
  PluginSubagentStatus,
  PluginSubagentWriteBackStatus,
} from './plugin-ai';
import type { PluginMessageTargetInfo, PluginMessageTargetRef } from './plugin-chat';
import type { PluginCallContext, PluginRuntimeKind } from './plugin-core';

export interface PluginSubagentWriteBack {
  target?: PluginMessageTargetRef | null;
}

export interface PluginSubagentTypeSummary {
  id: string;
  name: string;
  description?: string;
}

export interface PluginSubagentStartParams extends PluginSubagentRunParams {
  writeBack?: PluginSubagentWriteBack | null;
}

export interface PluginSubagentSummary {
  sessionId: string;
  sessionMessageCount: number;
  sessionUpdatedAt: string;
  description?: string;
  subagentType?: string;
  subagentTypeName?: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  status: PluginSubagentStatus;
  requestPreview: string;
  resultPreview?: string;
  providerId?: string;
  modelId?: string;
  error?: string;
  writeBackStatus: PluginSubagentWriteBackStatus;
  writeBackTarget?: PluginMessageTargetInfo | null;
  writeBackError?: string;
  writeBackMessageId?: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  conversationId?: string;
  userId?: string;
}

export interface PluginSubagentDetail extends PluginSubagentSummary {
  request: PluginSubagentRequest;
  context: PluginCallContext;
  result?: PluginSubagentExecutionResult | null;
}

export interface PluginSubagentOverview {
  subagents: PluginSubagentSummary[];
}
