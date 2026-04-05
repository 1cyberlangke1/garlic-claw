import { clonePluginGatewayCallContext } from './plugin-gateway-context';
import {
  extractPluginCallContext,
  readPluginRouteResponseOrThrow,
} from './plugin-gateway-payload.helpers';
import {
  readPluginGatewayTimeoutMs,
  sendPluginGatewayRequest,
  sendTypedPluginGatewayRequest,
  type ActiveRequestContext,
  type PendingRequest,
  type PluginGatewayPayload,
  type PluginGatewaySocketRef,
} from './plugin-gateway-transport';
import type { JsonObject, JsonValue } from './types/json';
import type {
  PluginActionName,
  PluginCallContext,
  PluginHookName,
} from './types/plugin';
import type { PluginRouteRequest, PluginRouteResponse } from './types/plugin-route';
import { WS_ACTION, WS_TYPE } from './types/plugin';

export interface PluginGatewayRemoteConnection {
  ws: PluginGatewaySocketRef;
  pluginName: string;
}

export const DEFAULT_PLUGIN_GATEWAY_SUPPORTED_ACTIONS: PluginActionName[] = [
  'health-check',
  'reload',
  'reconnect',
];

type ReadPluginGatewayRemoteResult<TResult> =
  Parameters<typeof sendTypedPluginGatewayRequest<TResult>>[0]['readResult'];

function sendPluginGatewayRemoteRequest<TResult>(input: {
  connection: PluginGatewayRemoteConnection;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  context: PluginCallContext;
  timeoutMs: number;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  readResult?: ReadPluginGatewayRemoteResult<TResult>;
}): Promise<TResult> {
  const request = {
    socket: input.connection.ws,
    type: input.type,
    action: input.action,
    payload: input.payload,
    timeoutMs: input.timeoutMs,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
    extractContext: extractPluginCallContext,
    cloneContext: clonePluginGatewayCallContext,
  };

  return input.readResult
    ? sendTypedPluginGatewayRequest<TResult>({
      ...request,
      readResult: input.readResult,
    })
    : sendPluginGatewayRequest(request) as Promise<TResult>;
}

export function createPluginGatewayRemoteTransport(input: {
  connection: PluginGatewayRemoteConnection;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  disconnectPlugin: (pluginId: string) => Promise<void>;
  checkPluginHealth: (pluginId: string) => Promise<{ ok: boolean }>;
}) {
  return {
    executeTool: (request: {
      toolName: string;
      params: JsonObject;
      context: PluginCallContext;
    }): Promise<JsonValue> =>
      sendPluginGatewayRemoteRequest({
        connection: input.connection,
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE,
        payload: {
          toolName: request.toolName,
          params: request.params,
          context: request.context,
        },
        context: request.context,
        timeoutMs: readPluginGatewayTimeoutMs(request.context, 30000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
      }),
    invokeHook: (request: {
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }): Promise<JsonValue | null | undefined> =>
      sendPluginGatewayRemoteRequest({
        connection: input.connection,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOOK_INVOKE,
        payload: {
          hookName: request.hookName,
          context: request.context,
          payload: request.payload,
        },
        context: request.context,
        timeoutMs: readPluginGatewayTimeoutMs(request.context, 10000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
      }),
    invokeRoute: (request: {
      request: PluginRouteRequest;
      context: PluginCallContext;
    }): Promise<PluginRouteResponse> =>
      sendPluginGatewayRemoteRequest<PluginRouteResponse>({
        connection: input.connection,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_INVOKE,
        payload: {
          request: request.request,
          context: request.context,
        },
        context: request.context,
        timeoutMs: readPluginGatewayTimeoutMs(request.context, 15000),
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        readResult: readPluginRouteResponseOrThrow,
      }),
    reload: () => input.disconnectPlugin(input.connection.pluginName),
    reconnect: () => input.disconnectPlugin(input.connection.pluginName),
    checkHealth: () => input.checkPluginHealth(input.connection.pluginName),
    listSupportedActions: () => [...DEFAULT_PLUGIN_GATEWAY_SUPPORTED_ACTIONS],
  };
}
