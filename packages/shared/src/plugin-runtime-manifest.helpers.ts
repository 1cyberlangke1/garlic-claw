import type { JsonObject } from './types/json';
import type {
  PluginActionName,
  PluginCallContext,
  PluginErrorHookPayload,
  PluginCapability,
  PluginHookDescriptor,
  PluginHookName,
  PluginLifecycleHookInfo,
  PluginManifest,
  PluginRouteDescriptor,
  PluginRouteRequest,
  PluginRuntimeKind,
  PluginSelfInfo,
} from './types/plugin';
import { normalizeRoutePath } from './plugin-runtime-validation.helpers';

export function buildPluginLifecycleHookInfo(input: {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
}): PluginLifecycleHookInfo {
  return {
    id: input.manifest.id,
    runtimeKind: input.runtimeKind,
    deviceType: input.deviceType,
    manifest: input.manifest,
  };
}

export function buildRuntimePluginSelfInfo(input: {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  supportedActions: PluginActionName[];
}): PluginSelfInfo {
  return {
    id: input.manifest.id,
    name: input.manifest.name,
    runtimeKind: input.runtimeKind,
    permissions: [...input.manifest.permissions],
    hooks: [...(input.manifest.hooks ?? [])],
    routes: [...(input.manifest.routes ?? [])],
    supportedActions: [...input.supportedActions],
    ...(input.manifest.version ? { version: input.manifest.version } : {}),
    ...(input.manifest.description
      ? { description: input.manifest.description }
      : {}),
    ...(input.manifest.crons
      ? { crons: [...input.manifest.crons] }
      : {}),
    ...(input.manifest.commands
      ? { commands: [...input.manifest.commands] }
      : {}),
  };
}

export function buildStoredPluginSelfInfo(input: {
  plugin: PluginSelfInfo;
  supportedActions?: PluginActionName[];
}): PluginSelfInfo {
  return {
    ...input.plugin,
    ...(input.plugin.permissions
      ? { permissions: [...input.plugin.permissions] }
      : {}),
    ...(input.plugin.crons
      ? { crons: [...input.plugin.crons] }
      : {}),
    ...(input.plugin.commands
      ? { commands: [...input.plugin.commands] }
      : {}),
    ...(input.plugin.hooks
      ? { hooks: [...input.plugin.hooks] }
      : {}),
    ...(input.plugin.routes
      ? { routes: [...input.plugin.routes] }
      : {}),
    supportedActions: [...(input.supportedActions ?? ['health-check'])],
  };
}

export function buildPluginErrorHookPayload(input: {
  pluginId: string;
  context: PluginCallContext;
  type: string;
  message: string;
  metadata?: JsonObject;
  occurredAt?: string;
  runtimeInfo?: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
  } | null;
}): PluginErrorHookPayload {
  return {
    context: {
      ...input.context,
    },
    plugin: input.runtimeInfo
      ? buildPluginLifecycleHookInfo(input.runtimeInfo)
      : {
        id: input.pluginId,
        runtimeKind: 'remote',
        deviceType: 'remote',
        manifest: null,
      },
    error: {
      type: input.type,
      message: input.message,
      metadata: input.metadata ?? null,
    },
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}

export function buildPluginErrorHookPayloadForRuntimeRecord(input: {
  pluginId: string;
  context: PluginCallContext;
  type: string;
  message: string;
  metadata?: JsonObject;
  occurredAt?: string;
  record?: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
  } | null;
}): PluginErrorHookPayload {
  return buildPluginErrorHookPayload({
    pluginId: input.pluginId,
    context: input.context,
    type: input.type,
    message: input.message,
    metadata: input.metadata,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.record
      ? {
        runtimeInfo: {
          manifest: input.record.manifest,
          runtimeKind: input.record.runtimeKind,
          deviceType: input.record.deviceType,
        },
      }
      : {}),
  });
}

export function findManifestHookDescriptor(
  manifest: PluginManifest,
  hookName: PluginHookName,
): PluginHookDescriptor | null {
  return (manifest.hooks ?? []).find((hook) => hook.name === hookName) ?? null;
}

export function findManifestRoute(
  manifest: PluginManifest,
  method: PluginRouteRequest['method'],
  path: string,
): PluginRouteDescriptor | null {
  const normalizedPath = normalizeRoutePath(path);
  return (manifest.routes ?? []).find(
    (item) =>
      normalizeRoutePath(item.path) === normalizedPath
      && item.methods.includes(method),
  ) ?? null;
}

export function findManifestTool(
  manifest: PluginManifest,
  toolName: string,
): PluginCapability | null {
  return (manifest.tools ?? []).find((item) => item.name === toolName) ?? null;
}
