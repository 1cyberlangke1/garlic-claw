import type {
  JsonValue,
  PluginCallContext,
  PluginHostMethod,
} from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import type { WebSocket } from 'ws';
import type { JsonObject } from '../common/types/json-value';
import {
  clonePluginGatewayCallContext,
  resolvePluginGatewayHostCallContext,
  sameAuthorizedPluginGatewayContext,
} from './plugin-gateway-context.helpers';
import {
  isConnectionScopedHostMethod,
  readHostCallPayload,
  type PluginGatewayInboundMessage,
} from '@garlic-claw/shared';
import {
  readPluginGatewayRequestId,
  sendPluginGatewayMessage,
  type ActiveRequestContext,
} from './plugin-gateway-transport.helpers';

export interface PluginGatewayHostCallConnection {
  ws: WebSocket;
  pluginName: string;
}

export async function handlePluginGatewayHostCall(input: {
  ws: WebSocket;
  connection: PluginGatewayHostCallConnection;
  msg: PluginGatewayInboundMessage;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  callHost: (input: {
    pluginId: string;
    context: PluginCallContext;
    method: PluginHostMethod;
    params: JsonObject;
  }) => Promise<JsonValue>;
  sendMessage?: typeof sendPluginGatewayMessage;
  logWarn?: (message: string) => void;
}): Promise<void> {
  const requestId = readPluginGatewayRequestId({
    msg: input.msg,
    onMissing: input.logWarn,
  });
  if (!requestId) {
    return;
  }

  const payload = readHostCallPayload(input.msg.payload);
  const sendMessage = input.sendMessage ?? sendPluginGatewayMessage;
  if (!payload) {
    sendMessage({
      ws: input.ws,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      payload: { error: '无效的 Host API 调用负载' },
      requestId,
    });
    return;
  }

  try {
    const context = resolvePluginGatewayHostCallContext({
      ws: input.connection.ws,
      method: payload.method,
      context: payload.context,
      activeRequestContexts: input.activeRequestContexts,
      isConnectionScopedHostMethod: (method) => isConnectionScopedHostMethod(method),
      isSameContext: sameAuthorizedPluginGatewayContext,
      cloneContext: clonePluginGatewayCallContext,
    });
    const result = await input.callHost({
      pluginId: input.connection.pluginName,
      context,
      method: payload.method,
      params: payload.params,
    });
    sendMessage({
      ws: input.ws,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_RESULT,
      payload: { data: result },
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendMessage({
      ws: input.ws,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      payload: { error: message },
      requestId,
    });
  }
}
