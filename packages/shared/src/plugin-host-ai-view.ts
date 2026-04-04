import { toJsonValue } from './types/json';
import type { JsonValue } from './types/json';
import type { AiUtilityModelRole } from './types/ai';
import type {
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginProviderSummary,
} from './types/plugin';

export function resolveHostUtilityRoleForGeneration(
  pluginId: string,
  context: PluginCallContext,
  params: Pick<PluginLlmGenerateParams, 'providerId' | 'modelId'>,
): AiUtilityModelRole | undefined {
  if (params.providerId || params.modelId) {
    return undefined;
  }

  if (
    pluginId === 'builtin.conversation-title'
    && context.activeProviderId
    && context.activeModelId
  ) {
    params.providerId = context.activeProviderId;
    params.modelId = context.activeModelId;
    return 'conversationTitle';
  }

  return 'pluginGenerateText';
}

export function buildCurrentHostProviderInfo(
  context: PluginCallContext,
  fallbackModelConfig: { providerId: string; id: string },
) {
  if (context.activeProviderId && context.activeModelId) {
    return {
      source: 'context' as const,
      providerId: context.activeProviderId,
      modelId: context.activeModelId,
    };
  }

  return {
    source: 'default' as const,
    providerId: String(fallbackModelConfig.providerId),
    modelId: String(fallbackModelConfig.id),
  };
}

export function buildHostProviderModelSummary(
  model: {
    id: string;
    providerId: string;
    name: string;
    capabilities: unknown;
    status?: string;
  },
) {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    capabilities: model.capabilities,
    status: model.status,
  };
}

export function findHostProviderSummary(
  providers: PluginProviderSummary[],
  providerId: string,
): PluginProviderSummary | null {
  return providers.find((item) => item.id === providerId) ?? null;
}

export function resolveHostProviderModelSummary(input: {
  registryModel?: {
    id: string;
    providerId: string;
    name: string;
    capabilities: unknown;
    status?: string;
  };
  listedModels: Array<{
    id: string;
    providerId: string;
    name: string;
    capabilities: unknown;
    status?: string;
  }>;
  modelId: string;
}) {
  const model = input.registryModel
    ?? input.listedModels.find((item) => String(item.id) === input.modelId)
    ?? null;
  return model ? buildHostProviderModelSummary(model) : null;
}

export function buildHostGenerateResult(input: {
  modelConfig: { providerId: string; id: string };
  result: {
    text: string;
    finishReason?: unknown;
    usage?: JsonValue;
  };
}): PluginLlmGenerateResult {
  return {
    providerId: String(input.modelConfig.providerId),
    modelId: String(input.modelConfig.id),
    text: input.result.text,
    message: {
      role: 'assistant',
      content: input.result.text,
    },
    ...(input.result.finishReason !== undefined
      ? { finishReason: String(input.result.finishReason) }
      : {}),
    ...(input.result.usage !== undefined
      ? { usage: toJsonValue(input.result.usage) }
      : {}),
  };
}

export function buildHostGenerateTextResult(
  result: Pick<PluginLlmGenerateResult, 'providerId' | 'modelId' | 'text'>,
) {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
  };
}
