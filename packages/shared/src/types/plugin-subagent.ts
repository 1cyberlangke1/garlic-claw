import type {
  PluginSubagentExecutionResult,
  PluginSubagentCloseParams,
  PluginSubagentRequest,
  PluginSubagentInterruptParams,
  PluginSubagentSendInputParams,
  PluginSubagentStatus,
  PluginSubagentSpawnParams,
  PluginSubagentWaitParams,
} from './plugin-ai';
import type { ConversationSubagentState } from './chat';
import type { PluginCallContext, PluginRuntimeKind } from './plugin-core';

export interface PluginSubagentTypeSummary {
  id: string;
  name: string;
  description?: string;
}

export interface PluginSubagentHandle {
  conversationId: string;
  status: PluginSubagentStatus;
  title: string;
  name?: string;
}

export interface PluginSubagentWaitResult extends PluginSubagentHandle {
  result?: string;
  error?: string;
}

export interface PluginSubagentSummary {
  conversationId: string;
  parentConversationId?: string;
  title: string;
  messageCount: number;
  updatedAt: string;
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
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  closedAt: string | null;
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

export type PluginSubagentConversationState = ConversationSubagentState;
export type {
  PluginSubagentSpawnParams,
  PluginSubagentWaitParams,
  PluginSubagentSendInputParams,
  PluginSubagentInterruptParams,
  PluginSubagentCloseParams,
};
