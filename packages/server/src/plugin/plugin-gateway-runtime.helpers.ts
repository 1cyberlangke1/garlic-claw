import type {
  PluginRouteResponse,
} from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  clonePluginGatewayCallContext,
} from './plugin-gateway-context.helpers';
import {
  extractPluginCallContext,
  readPluginRouteResponseOrThrow,
} from '@garlic-claw/shared';
import {
  readPluginGatewayTimeoutMs,
  sendPluginGatewayRequest,
  sendTypedPluginGatewayRequest,
  type ActiveRequestContext,
  type PendingRequest,
} from './plugin-gateway-transport.helpers';
import type { PluginTransport } from './plugin-runtime.types';

export interface PluginGatewayRuntimeConnection {
  ws: WebSocket;
  pluginName: string;
}

export interface PluginGatewayHeartbeatConnection {
  ws: WebSocket;
  pluginName: string;
  authenticated: boolean;
  lastHeartbeatAt: number;
}

export function createPluginGatewayRemoteTransport(input: {
  connection: PluginGatewayRuntimeConnection;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  disconnectPlugin: (pluginId: string) => Promise<void>;
  checkPluginHealth: (pluginId: string) => Promise<{ ok: boolean }>;
}): PluginTransport {
  return {
    executeTool: ({ toolName, params, context }) =>
      sendPluginGatewayRequest({
        ws: input.connection.ws,
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE,
        payload: {
          toolName,
          params,
          context,
        },
        timeoutMs: readPluginGatewayTimeoutMs(context, 30000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        extractContext: extractPluginCallContext,
        cloneContext: clonePluginGatewayCallContext,
      }),
    invokeHook: ({ hookName, context, payload }) =>
      sendPluginGatewayRequest({
        ws: input.connection.ws,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOOK_INVOKE,
        payload: {
          hookName,
          context,
          payload,
        },
        timeoutMs: readPluginGatewayTimeoutMs(context, 10000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        extractContext: extractPluginCallContext,
        cloneContext: clonePluginGatewayCallContext,
      }),
    invokeRoute: ({ request, context }) =>
      sendTypedPluginGatewayRequest<PluginRouteResponse>({
        ws: input.connection.ws,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_INVOKE,
        payload: {
          request,
          context,
        },
        timeoutMs: readPluginGatewayTimeoutMs(context, 15000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        extractContext: extractPluginCallContext,
        cloneContext: clonePluginGatewayCallContext,
        readResult: readPluginRouteResponseOrThrow,
      }),
    reload: () => input.disconnectPlugin(input.connection.pluginName),
    reconnect: () => input.disconnectPlugin(input.connection.pluginName),
    checkHealth: () => input.checkPluginHealth(input.connection.pluginName),
    listSupportedActions: () => ['health-check', 'reload', 'reconnect'],
  };
}

export function checkPluginGatewayHealth(input: {
  pluginId: string;
  connection: {
    ws: WebSocket;
  };
  timeoutMs: number;
}): Promise<{ ok: boolean }> {
  if (input.connection.ws.readyState !== WebSocket.OPEN) {
    return Promise.resolve({
      ok: false,
    });
  }

  return new Promise<{ ok: boolean }>((resolve, reject) => {
    const handlePong = () => {
      clearTimeout(timer);
      input.connection.ws.off('pong', handlePong);
      resolve({
        ok: true,
      });
    };
    const timer = setTimeout(() => {
      input.connection.ws.off('pong', handlePong);
      reject(new Error(`插件健康检查超时: ${input.pluginId}`));
    }, input.timeoutMs);

    input.connection.ws.once('pong', handlePong);
    input.connection.ws.ping();
  });
}

export function sweepStalePluginGatewayConnections(input: {
  now: number;
  heartbeatTimeoutMs: number;
  connections: Iterable<PluginGatewayHeartbeatConnection>;
  onStaleConnection?: (connection: PluginGatewayHeartbeatConnection) => void;
}): void {
  for (const connection of input.connections) {
    if (!connection.authenticated) {
      continue;
    }

    const lastHeartbeatAt = typeof connection.lastHeartbeatAt === 'number'
      ? connection.lastHeartbeatAt
      : input.now;
    if (input.now - lastHeartbeatAt <= input.heartbeatTimeoutMs) {
      continue;
    }

    input.onStaleConnection?.(connection);
    connection.ws.close();
  }
}
