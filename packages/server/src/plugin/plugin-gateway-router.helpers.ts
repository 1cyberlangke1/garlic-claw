import { WS_ACTION } from '@garlic-claw/shared';
import type { WebSocket } from 'ws';
import { toJsonValue } from '../common/utils/json-value';
import {
  handlePluginGatewayErrorMessage,
  handlePluginGatewayResultMessage,
} from './plugin-gateway-dispatch.helpers';
import {
  readDataPayload,
  readErrorPayload,
  readRegisterPayload,
  readRouteResultPayload,
  type PluginGatewayInboundMessage,
  type ValidatedRegisterPayload,
} from './plugin-gateway-payload.helpers';
import {
  sendPluginGatewayProtocolError,
  type ActiveRequestContext,
  type PendingRequest,
} from './plugin-gateway-transport.helpers';

export async function handlePluginGatewayPluginMessage(input: {
  ws: WebSocket;
  msg: PluginGatewayInboundMessage;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  protocolErrorAction: string;
  onRegister: (payload: ValidatedRegisterPayload) => Promise<void>;
  onHostCall: (msg: PluginGatewayInboundMessage) => Promise<void>;
  logWarn?: (message: string) => void;
  sendProtocolError?: typeof sendPluginGatewayProtocolError;
}): Promise<void> {
  const sendProtocolError = input.sendProtocolError ?? sendPluginGatewayProtocolError;

  switch (input.msg.action) {
    case WS_ACTION.REGISTER: {
      const payload = readRegisterPayload(input.msg.payload);
      if (!payload) {
        sendProtocolError({
          ws: input.ws,
          error: '无效的插件注册负载',
          protocolErrorAction: input.protocolErrorAction,
        });
        return;
      }
      await input.onRegister(payload);
      return;
    }
    case WS_ACTION.HOOK_RESULT: {
      handlePluginGatewayResultMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的 Hook 返回负载',
        readPayload: readDataPayload,
      }, input.msg.payload);
      return;
    }
    case WS_ACTION.HOOK_ERROR: {
      handlePluginGatewayErrorMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的 Hook 错误负载',
        readPayload: readErrorPayload,
      }, input.msg.payload);
      return;
    }
    case WS_ACTION.ROUTE_RESULT: {
      handlePluginGatewayResultMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的插件 Route 返回负载',
        readPayload: (payload) => {
          const result = readRouteResultPayload(payload);
          return result
            ? {
              data: toJsonValue(result.data),
            }
            : null;
        },
      }, input.msg.payload);
      return;
    }
    case WS_ACTION.ROUTE_ERROR: {
      handlePluginGatewayErrorMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的插件 Route 错误负载',
        readPayload: readErrorPayload,
      }, input.msg.payload);
      return;
    }
    case WS_ACTION.HOST_CALL:
      await input.onHostCall(input.msg);
      return;
    default:
      return;
  }
}

export function handlePluginGatewayCommandMessage(input: {
  msg: PluginGatewayInboundMessage;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  logWarn?: (message: string) => void;
}): void {
  switch (input.msg.action) {
    case WS_ACTION.EXECUTE_RESULT: {
      handlePluginGatewayResultMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的远程命令返回负载',
        readPayload: readDataPayload,
      }, input.msg.payload);
      return;
    }
    case WS_ACTION.EXECUTE_ERROR: {
      handlePluginGatewayErrorMessage({
        msg: input.msg,
        pendingRequests: input.pendingRequests,
        activeRequestContexts: input.activeRequestContexts,
        loggerWarn: input.logWarn,
        invalidPayloadMessage: '无效的远程命令错误负载',
        readPayload: readErrorPayload,
      }, input.msg.payload);
      return;
    }
    default:
      return;
  }
}
