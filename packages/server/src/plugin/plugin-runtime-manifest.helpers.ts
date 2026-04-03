import type {
  PluginManifest,
  PluginRouteRequest,
} from '@garlic-claw/shared';
import {
  buildPluginErrorHookPayload,
  buildPluginErrorHookPayloadForRuntimeRecord,
  buildPluginLifecycleHookInfo,
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
  findManifestHookDescriptor,
  findManifestRoute,
  findManifestTool,
  normalizeRoutePath,
} from '@garlic-claw/shared';
import { NotFoundException } from '@nestjs/common';
export {
  buildPluginErrorHookPayload,
  buildPluginErrorHookPayloadForRuntimeRecord,
  buildPluginLifecycleHookInfo,
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
  findManifestHookDescriptor,
};

export function findManifestRouteOrThrow(
  manifest: PluginManifest,
  method: PluginRouteRequest['method'],
  path: string,
) {
  const route = findManifestRoute(manifest, method, path);
  if (route) {
    return route;
  }

  throw new NotFoundException(
    `插件 ${manifest.id} 未声明 Route: ${method} ${normalizeRoutePath(path)}`,
  );
}

export function findManifestToolOrThrow(
  manifest: PluginManifest,
  toolName: string,
) {
  const tool = findManifestTool(manifest, toolName);
  if (!tool) {
    throw new NotFoundException(`Tool not found: ${manifest.id}:${toolName}`);
  }

  return tool;
}
