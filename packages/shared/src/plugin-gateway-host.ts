import {
  readHostCallPayload,
  type PluginGatewayInboundMessage,
} from './plugin-gateway-payload.helpers';
import { WS_ACTION, WS_TYPE } from './types/plugin';
import type { JsonObject, JsonValue } from './types/json';
import type {
  PluginCallContext,
  PluginHostMethod,
} from './types/plugin';
import {
  readPluginGatewayRequestId,
  sendPluginGatewayMessage,
  type ActiveRequestContext,
  type PluginGatewaySocketRef,
} from './plugin-gateway-transport';
import { resolvePluginGatewayHostCallContext } from './plugin-gateway-context';

export interface PluginGatewayHostCallConnection {
  socket: PluginGatewaySocketRef;
  pluginName: string;
}

export async function handlePluginGatewayHostCall(input: {
  socket: PluginGatewaySocketRef;
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
      socket: input.socket,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      payload: { error: '无效的 Host API 调用负载' },
      requestId,
    });
    return;
  }

  try {
    const context = resolvePluginGatewayHostCallContext({
      socket: input.connection.socket,
      method: payload.method,
      context: payload.context,
      activeRequestContexts: input.activeRequestContexts,
    });
    const result = await input.callHost({
      pluginId: input.connection.pluginName,
      context,
      method: payload.method,
      params: payload.params,
    });
    sendMessage({
      socket: input.socket,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_RESULT,
      payload: { data: result },
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendMessage({
      socket: input.socket,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      payload: { error: message },
      requestId,
    });
  }
}
