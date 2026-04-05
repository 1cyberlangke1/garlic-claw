import type { JsonValue, PluginManifest } from '@garlic-claw/shared';
import { readJsonObjectValue } from './common-helpers';

export interface PluginProviderRouterConfig {
  targetProviderId?: string;
  targetModelId?: string;
  allowedToolNames?: string;
  shortCircuitKeyword?: string;
  shortCircuitReply?: string;
}

export interface PluginCurrentProviderInfo {
  providerId?: string;
  modelId?: string;
}

export interface PluginPersonaRouterConfig {
  targetPersonaId?: string;
  switchKeyword?: string;
}

export interface PluginCurrentPersonaInfo {
  personaId?: string;
}

export interface PluginPersonaSummaryInfo {
  id?: string;
  prompt?: string;
}

export const PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY =
  '本轮请求已由 provider-router 直接处理。';

export const PROVIDER_ROUTER_CONFIG_FIELDS = [
  {
    key: 'targetProviderId',
    type: 'string',
    description: '命中路由时切换到的 provider ID',
  },
  {
    key: 'targetModelId',
    type: 'string',
    description: '命中路由时切换到的 model ID',
  },
  {
    key: 'allowedToolNames',
    type: 'string',
    description: '允许暴露给模型的工具名列表，使用英文逗号分隔',
  },
  {
    key: 'shortCircuitKeyword',
    type: 'string',
    description: '当最近一条用户消息包含该关键字时，直接返回 short-circuit',
  },
  {
    key: 'shortCircuitReply',
    type: 'string',
    description: 'short-circuit 时直接写回给 assistant 的文本',
    defaultValue: PROVIDER_ROUTER_DEFAULT_SHORT_CIRCUIT_REPLY,
  },
] satisfies NonNullable<PluginManifest['config']>['fields'];

export const PERSONA_ROUTER_CONFIG_FIELDS = [
  {
    key: 'targetPersonaId',
    type: 'string',
    description: '命中路由后要切换到的 persona ID',
  },
  {
    key: 'switchKeyword',
    type: 'string',
    description: '当最近一条用户消息包含该关键字时，切换到目标 persona',
  },
] satisfies NonNullable<PluginManifest['config']>['fields'];

export function readProviderRouterConfig(
  value: unknown,
): PluginProviderRouterConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.targetProviderId === 'string'
      ? { targetProviderId: object.targetProviderId }
      : {}),
    ...(typeof object.targetModelId === 'string'
      ? { targetModelId: object.targetModelId }
      : {}),
    ...(typeof object.allowedToolNames === 'string'
      ? { allowedToolNames: object.allowedToolNames }
      : {}),
    ...(typeof object.shortCircuitKeyword === 'string'
      ? { shortCircuitKeyword: object.shortCircuitKeyword }
      : {}),
    ...(typeof object.shortCircuitReply === 'string'
      ? { shortCircuitReply: object.shortCircuitReply }
      : {}),
  };
}

export function readCurrentProviderInfo(
  value: unknown,
): PluginCurrentProviderInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.providerId === 'string' ? { providerId: object.providerId } : {}),
    ...(typeof object.modelId === 'string' ? { modelId: object.modelId } : {}),
  };
}

export function readPersonaRouterConfig(
  value: unknown,
): PluginPersonaRouterConfig {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.targetPersonaId === 'string'
      ? { targetPersonaId: object.targetPersonaId }
      : {}),
    ...(typeof object.switchKeyword === 'string'
      ? { switchKeyword: object.switchKeyword }
      : {}),
  };
}

export function readCurrentPersonaInfo(
  value: unknown,
): PluginCurrentPersonaInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.personaId === 'string' ? { personaId: object.personaId } : {}),
  };
}

export function readPersonaSummaryInfo(
  value: unknown,
): PluginPersonaSummaryInfo {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.id === 'string' ? { id: object.id } : {}),
    ...(typeof object.prompt === 'string' ? { prompt: object.prompt } : {}),
  };
}
