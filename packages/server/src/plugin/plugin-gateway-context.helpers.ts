import type {
  PluginCallContext,
  PluginHostMethod,
  PluginManifest,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import { normalizePluginManifestCandidate } from './plugin-manifest.persistence';
import type { ActiveRequestContext } from './plugin-gateway-transport.helpers';

export function resolvePluginGatewayManifest(input: {
  pluginName: string;
  manifest: Record<string, unknown> | null | undefined;
}): PluginManifest {
  if (!input.manifest) {
    throw new Error('插件注册负载缺少 manifest');
  }

  return normalizePluginManifestCandidate(input.manifest, {
    id: input.pluginName,
    displayName: input.pluginName,
    version: '0.0.0',
    runtimeKind: 'remote',
  });
}

export function findApprovedPluginGatewayRequestContext(input: {
  ws: WebSocket;
  context?: PluginCallContext;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  isSameContext: (left: PluginCallContext, right: PluginCallContext) => boolean;
  cloneContext: (context: PluginCallContext) => PluginCallContext;
}): PluginCallContext | null {
  if (!input.context) {
    return null;
  }

  for (const active of input.activeRequestContexts.values()) {
    if (active.ws !== input.ws) {
      continue;
    }
    if (!input.isSameContext(active.context, input.context)) {
      continue;
    }

    return input.cloneContext(active.context);
  }

  return null;
}

export function resolvePluginGatewayHostCallContext(input: {
  ws: WebSocket;
  method: PluginHostMethod;
  context?: PluginCallContext;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  isConnectionScopedHostMethod: (method: PluginHostMethod) => boolean;
  isSameContext: (left: PluginCallContext, right: PluginCallContext) => boolean;
  cloneContext: (context: PluginCallContext) => PluginCallContext;
}): PluginCallContext {
  const approvedContext = findApprovedPluginGatewayRequestContext({
    ws: input.ws,
    context: input.context,
    activeRequestContexts: input.activeRequestContexts,
    isSameContext: input.isSameContext,
    cloneContext: input.cloneContext,
  });
  if (approvedContext) {
    return approvedContext;
  }

  if (input.isConnectionScopedHostMethod(input.method)) {
    return {
      source: 'plugin',
    };
  }

  throw new Error(`Host API ${input.method} 缺少已授权的调用上下文`);
}

export function sameAuthorizedPluginGatewayContext(
  left: PluginCallContext,
  right: PluginCallContext,
): boolean {
  return left.source === right.source
    && left.userId === right.userId
    && left.conversationId === right.conversationId
    && left.automationId === right.automationId
    && left.cronJobId === right.cronJobId
    && left.activeProviderId === right.activeProviderId
    && left.activeModelId === right.activeModelId
    && left.activePersonaId === right.activePersonaId;
}

export function clonePluginGatewayCallContext(
  context: PluginCallContext,
): PluginCallContext {
  return {
    source: context.source,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    ...(context.automationId ? { automationId: context.automationId } : {}),
    ...(context.cronJobId ? { cronJobId: context.cronJobId } : {}),
    ...(context.activeProviderId ? { activeProviderId: context.activeProviderId } : {}),
    ...(context.activeModelId ? { activeModelId: context.activeModelId } : {}),
    ...(context.activePersonaId ? { activePersonaId: context.activePersonaId } : {}),
    ...(context.metadata ? { metadata: { ...context.metadata } } : {}),
  };
}
