import { isConnectionScopedHostMethod } from './plugin-gateway-payload.helpers';
import type { PluginCallContext } from './types/plugin';
import type { PluginHostMethod } from './types/plugin-host';
import type {
  ActiveRequestContext,
  PluginGatewaySocketRef,
} from './plugin-gateway-transport';

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

export function findApprovedPluginGatewayRequestContext(input: {
  socket: PluginGatewaySocketRef;
  context?: PluginCallContext;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): PluginCallContext | null {
  if (!input.context) {
    return null;
  }

  for (const active of input.activeRequestContexts.values()) {
    if (active.socket !== input.socket) {
      continue;
    }
    if (!sameAuthorizedPluginGatewayContext(active.context, input.context)) {
      continue;
    }

    return clonePluginGatewayCallContext(active.context);
  }

  return null;
}

export function resolvePluginGatewayHostCallContext(input: {
  socket: PluginGatewaySocketRef;
  method: PluginHostMethod;
  context?: PluginCallContext;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): PluginCallContext {
  const approvedContext = findApprovedPluginGatewayRequestContext({
    socket: input.socket,
    context: input.context,
    activeRequestContexts: input.activeRequestContexts,
  });
  if (approvedContext) {
    return approvedContext;
  }

  if (isConnectionScopedHostMethod(input.method)) {
    return { source: 'plugin' };
  }

  throw new Error(`Host API ${input.method} 缺少已授权的调用上下文`);
}
