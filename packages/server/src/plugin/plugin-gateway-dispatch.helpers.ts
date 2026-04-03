import type { JsonValue } from '@garlic-claw/shared';
import {
  readPluginGatewayRequestId,
  rejectPluginGatewayPendingRequest,
  resolvePluginGatewayPendingRequest,
  type ActiveRequestContext,
  type PendingRequest,
} from './plugin-gateway-transport.helpers';

interface PluginGatewayResultPayload {
  data: JsonValue;
}

interface PluginGatewayErrorPayload {
  error: string;
}

interface PluginGatewayDispatchInput<TPayload> {
  msg: {
    requestId?: unknown;
    type: string;
    action: string;
  };
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  loggerWarn?: (message: string) => void;
  invalidPayloadMessage: string;
  readPayload: (payload: unknown) => TPayload | null;
}

export function handlePluginGatewayResultMessage(
  input: PluginGatewayDispatchInput<PluginGatewayResultPayload>,
  rawPayload: unknown,
): void {
  const requestId = readPluginGatewayRequestId({
    msg: input.msg,
    onMissing: input.loggerWarn,
  });
  const payload = input.readPayload(rawPayload);
  if (!payload) {
    rejectPluginGatewayPendingRequest({
      requestId,
      error: input.invalidPayloadMessage,
      pendingRequests: input.pendingRequests,
      activeRequestContexts: input.activeRequestContexts,
    });
    return;
  }

  resolvePluginGatewayPendingRequest({
    requestId,
    data: payload.data,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
  });
}

export function handlePluginGatewayErrorMessage(
  input: PluginGatewayDispatchInput<PluginGatewayErrorPayload>,
  rawPayload: unknown,
): void {
  const requestId = readPluginGatewayRequestId({
    msg: input.msg,
    onMissing: input.loggerWarn,
  });
  const payload = input.readPayload(rawPayload);
  if (!payload) {
    rejectPluginGatewayPendingRequest({
      requestId,
      error: input.invalidPayloadMessage,
      pendingRequests: input.pendingRequests,
      activeRequestContexts: input.activeRequestContexts,
    });
    return;
  }

  rejectPluginGatewayPendingRequest({
    requestId,
    error: payload.error,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
  });
}
