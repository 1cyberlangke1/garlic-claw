import { readPluginGatewayMessage, type PluginGatewayInboundMessage } from './plugin-gateway-payload.helpers';
import {
  sendPluginGatewayMessage,
  sendPluginGatewayProtocolError,
  type PluginGatewaySocketRef,
} from './plugin-gateway-transport';

export async function handlePluginGatewayInboundRawMessage(input: {
  socket: PluginGatewaySocketRef;
  raw: Buffer;
  protocolErrorAction: string;
  handleMessage: (message: PluginGatewayInboundMessage) => Promise<void>;
  sendMessage?: typeof sendPluginGatewayMessage;
  sendProtocolError?: typeof sendPluginGatewayProtocolError;
  readMessage?: (value: unknown) => PluginGatewayInboundMessage | null;
  logWarn?: (message: string) => void;
}): Promise<void> {
  const sendMessage = input.sendMessage ?? sendPluginGatewayMessage;
  const sendProtocolError = input.sendProtocolError ?? sendPluginGatewayProtocolError;
  const readMessage = input.readMessage ?? readPluginGatewayMessage;
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.raw.toString());
  } catch {
    sendMessage({
      socket: input.socket,
      type: 'error',
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    });
    return;
  }

  const message = readMessage(parsed);
  if (!message) {
    sendProtocolError({
      socket: input.socket,
      error: '无效的插件协议消息',
      protocolErrorAction: input.protocolErrorAction,
    });
    return;
  }

  try {
    await input.handleMessage(message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    input.logWarn?.(`插件协议消息处理失败: ${messageText}`);
    sendProtocolError({
      socket: input.socket,
      error: '插件协议消息处理失败',
      protocolErrorAction: input.protocolErrorAction,
    });
  }
}
