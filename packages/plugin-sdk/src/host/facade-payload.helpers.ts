import type { ActionConfig, JsonObject, PluginConversationHistoryPreviewParams, PluginConversationHistoryReplaceParams, PluginConversationSessionKeepParams, PluginConversationSessionStartParams, PluginCronDescriptor, PluginLlmGenerateParams, PluginMessageSendParams, PluginSubagentCloseParams, PluginSubagentInterruptParams, PluginSubagentSendInputParams, PluginSubagentSpawnParams, PluginSubagentWaitParams, TriggerConfig } from "@garlic-claw/shared";

import type { PluginGenerateTextParams, PluginScopedStateOptions } from "./facade";
import { toHostJsonValue } from "./host-json-value.codec";

export function buildPluginMessageSendParams(input: PluginMessageSendParams): JsonObject {
  return {
    ...(input.target ? { target: toHostJsonValue(input.target) } : {}),
    ...(typeof input.content === "string" ? { content: input.content } : {}),
    ...(input.parts ? { parts: toHostJsonValue(input.parts) } : {}),
    ...(typeof input.provider === "string" ? { provider: input.provider } : {}),
    ...(typeof input.model === "string" ? { model: input.model } : {}),
  };
}

export function buildPluginConversationSessionStartParams(input: PluginConversationSessionStartParams): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.captureHistory === "boolean" ? { captureHistory: input.captureHistory } : {}),
    ...(typeof input.metadata !== "undefined" ? { metadata: input.metadata } : {}),
  };
}

export function buildPluginConversationSessionKeepParams(input: PluginConversationSessionKeepParams): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.resetTimeout === "boolean" ? { resetTimeout: input.resetTimeout } : {}),
  };
}

export function buildPluginRegisterCronParams(descriptor: PluginCronDescriptor): JsonObject {
  return {
    name: descriptor.name,
    cron: descriptor.cron,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(typeof descriptor.enabled === "boolean" ? { enabled: descriptor.enabled } : {}),
    ...(typeof descriptor.data !== "undefined" ? { data: descriptor.data } : {}),
  };
}

export function buildPluginCreateAutomationParams(input: { name: string; trigger: TriggerConfig; actions: ActionConfig[] }): JsonObject {
  return {
    name: input.name,
    trigger: toHostJsonValue(input.trigger),
    actions: toHostJsonValue(input.actions),
  };
}

export function buildPluginGenerateParams(input: PluginLlmGenerateParams): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(input.transportMode ? { transportMode: input.transportMode } : {}),
  };
}

export function buildPluginSubagentSpawnParams(input: PluginSubagentSpawnParams & { writeBack?: JsonObject | { target: { id: string; type: "conversation" } } }): JsonObject {
  return {
    ...(input.name ? { name: input.name } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(typeof input.maxConversationSubagents === "number" ? { maxConversationSubagents: input.maxConversationSubagents } : {}),
    ...(input.subagentType ? { subagentType: input.subagentType } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(input.writeBack ? { writeBack: toHostJsonValue(input.writeBack) } : {}),
  };
}

export function buildPluginSubagentWaitParams(input: PluginSubagentWaitParams): JsonObject {
  return {
    conversationId: input.conversationId,
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
  };
}

export function buildPluginSubagentSendInputParams(input: PluginSubagentSendInputParams): JsonObject {
  return {
    conversationId: input.conversationId,
    ...(input.name ? { name: input.name } : {}),
    ...(input.description ? { description: input.description } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };
}

export function buildPluginSubagentInterruptParams(input: PluginSubagentInterruptParams): JsonObject {
  return {
    conversationId: input.conversationId,
  };
}

export function buildPluginSubagentCloseParams(input: PluginSubagentCloseParams): JsonObject {
  return {
    conversationId: input.conversationId,
  };
}

export function buildPluginGenerateTextParams(input: PluginGenerateTextParams): JsonObject {
  return {
    prompt: input.prompt,
    ...(input.system ? { system: input.system } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.transportMode ? { transportMode: input.transportMode } : {}),
  };
}

export function buildPluginConversationHistoryPreviewParams(
  input: PluginConversationHistoryPreviewParams = {},
): JsonObject {
  return {
    ...(input.messages ? { messages: toHostJsonValue(input.messages) } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
  };
}

export function buildPluginConversationHistoryReplaceParams(
  input: PluginConversationHistoryReplaceParams,
): JsonObject {
  return {
    expectedRevision: input.expectedRevision,
    messages: toHostJsonValue(input.messages),
  };
}

export function toScopedStateParams(options?: PluginScopedStateOptions): JsonObject {
  return options?.scope
    ? {
        scope: options.scope,
      }
    : {};
}
