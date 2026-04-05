import { normalizeRoutePath } from './plugin-runtime-validation.helpers';
import type { JsonObject } from './types/json';
import type {
  ToolBeforeCallHookPayload,
  ToolHookSourceInfo,
} from './types/plugin-operation';
import type {
  PluginCallContext,
  PluginCapability,
  PluginRuntimeKind,
} from './types/plugin';
import type { PluginRouteRequest } from './types/plugin-route';
import type { PluginAvailableToolSummary } from './types/plugin-ai';

export function buildPluginToolCallName(input: {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  toolName: string;
}): string {
  return input.runtimeKind === 'builtin'
    ? input.toolName
    : `${input.pluginId}__${input.toolName}`;
}

export function buildPluginToolDescription(input: {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  description: string;
}): string {
  return input.runtimeKind === 'builtin'
    ? input.description
    : `[插件：${input.pluginId}] ${input.description}`;
}

function buildPluginToolHookSourceInfo(input: {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  label: string;
}): ToolHookSourceInfo {
  return {
    kind: 'plugin',
    id: input.pluginId,
    label: input.label,
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
  };
}

export function buildPluginToolHookPayload(input: {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  label: string;
  tool: PluginCapability;
  context: PluginCallContext;
  params: JsonObject;
}): ToolBeforeCallHookPayload {
  return {
    context: {
      ...input.context,
    },
    source: buildPluginToolHookSourceInfo({
      pluginId: input.pluginId,
      runtimeKind: input.runtimeKind,
      label: input.label,
    }),
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
    tool: {
      ...input.tool,
      toolId: `plugin:${input.pluginId}:${input.tool.name}`,
      callName: buildPluginToolCallName({
        pluginId: input.pluginId,
        runtimeKind: input.runtimeKind,
        toolName: input.tool.name,
      }),
      parameters: {
        ...input.tool.parameters,
      },
    },
    params: {
      ...input.params,
    },
  };
}

export function buildPluginAvailableToolSummary(input: {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  tool: PluginCapability;
}): PluginAvailableToolSummary {
  return {
    name: buildPluginToolCallName({
      pluginId: input.pluginId,
      runtimeKind: input.runtimeKind,
      toolName: input.tool.name,
    }),
    description: buildPluginToolDescription({
      pluginId: input.pluginId,
      runtimeKind: input.runtimeKind,
      description: input.tool.description,
    }),
    parameters: input.tool.parameters,
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
  };
}

export function buildPluginRouteInvocationRequest(input: {
  request: PluginRouteRequest;
  path: string;
}): PluginRouteRequest {
  return {
    ...input.request,
    path: normalizeRoutePath(input.path),
  };
}
