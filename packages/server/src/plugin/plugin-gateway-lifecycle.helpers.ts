import type {
  AuthPayload,
  PluginManifest,
} from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import type { WebSocket } from 'ws';
import type {
  ActiveRequestContext,
  PendingRequest,
  PluginGatewayPayload,
} from './plugin-gateway-transport.helpers';
import type { ValidatedRegisterPayload } from '@garlic-claw/shared';
import type { PluginTransport } from './plugin-runtime.types';

export interface PluginGatewayLifecycleConnection {
  ws: WebSocket;
  pluginName: string;
  deviceType: string;
  authenticated: boolean;
  manifest: PluginManifest | null;
  lastHeartbeatAt: number;
}

interface PluginGatewayVerifiedToken {
  role?: string;
  authKind?: string;
  pluginName?: string;
  deviceType?: string;
}

interface SendGatewayMessageInput {
  ws: WebSocket;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
}

export async function authenticatePluginGatewayConnection(input: {
  ws: WebSocket;
  connection: PluginGatewayLifecycleConnection;
  payload: AuthPayload;
  verifyToken: (token: string) => PluginGatewayVerifiedToken;
  connectionByPluginId: Map<string, { ws: WebSocket }>;
  logWarn?: (message: string) => void;
  logInfo?: (message: string) => void;
  sendMessage: (input: SendGatewayMessageInput) => void;
}): Promise<void> {
  const verified = input.verifyToken(input.payload.token);
  const isAdminToken = verified.role === 'admin' || verified.role === 'super_admin';
  const isRemotePluginToken = verified.role === 'remote_plugin'
    && verified.authKind === 'remote-plugin';
  if (!isAdminToken && !isRemotePluginToken) {
    throw new Error('只有管理员或专用远程插件令牌可以接入远程插件');
  }

  if (
    isRemotePluginToken
    && (
      verified.pluginName !== input.payload.pluginName
      || verified.deviceType !== input.payload.deviceType
    )
  ) {
    throw new Error('远程插件令牌与当前插件标识不匹配');
  }

  const previousConnection = input.connectionByPluginId.get(input.payload.pluginName);
  input.connection.authenticated = true;
  input.connection.pluginName = input.payload.pluginName;
  input.connection.deviceType = input.payload.deviceType;
  input.connection.lastHeartbeatAt = Date.now();
  input.connectionByPluginId.set(input.payload.pluginName, input.connection);
  if (previousConnection && previousConnection.ws !== input.ws) {
    input.logWarn?.(`插件 "${input.payload.pluginName}" 已存在旧连接，当前将其替换`);
    previousConnection.ws.close();
  }

  input.sendMessage({
    ws: input.ws,
    type: WS_TYPE.AUTH,
    action: WS_ACTION.AUTH_OK,
    payload: {},
  });
  input.logInfo?.(`Plugin "${input.payload.pluginName}" authenticated`);
}

export async function registerPluginGatewayConnection(input: {
  ws: WebSocket;
  connection: PluginGatewayLifecycleConnection;
  payload: ValidatedRegisterPayload;
  resolveManifest: (input: {
    pluginName: string;
    manifest: Record<string, unknown> | null | undefined;
  }) => PluginManifest;
  createTransport: () => PluginTransport;
  registerPlugin: (input: {
    manifest: PluginManifest;
    runtimeKind: 'remote';
    deviceType: string;
    transport: PluginTransport;
  }) => Promise<unknown>;
  sendMessage: (input: SendGatewayMessageInput) => void;
}): Promise<void> {
  const manifest = input.resolveManifest({
    pluginName: input.connection.pluginName,
    manifest: input.payload.manifest as unknown as Record<string, unknown>,
  });
  input.connection.manifest = manifest;

  await input.registerPlugin({
    manifest,
    runtimeKind: 'remote',
    deviceType: input.connection.deviceType,
    transport: input.createTransport(),
  });

  input.sendMessage({
    ws: input.ws,
    type: WS_TYPE.PLUGIN,
    action: WS_ACTION.REGISTER_OK,
    payload: {},
  });
}

export async function disconnectPluginGatewayConnection(input: {
  connection: PluginGatewayLifecycleConnection;
  connections: Map<WebSocket, PluginGatewayLifecycleConnection>;
  connectionByPluginId: Map<string, { ws: WebSocket }>;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  unregisterPlugin: (pluginId: string) => Promise<void>;
  rejectPendingRequestsForSocket: (input: {
    ws: WebSocket;
    error: Error;
    pendingRequests: Map<string, PendingRequest>;
    activeRequestContexts: Map<string, ActiveRequestContext>;
  }) => void;
  logInfo?: (message: string) => void;
}): Promise<void> {
  input.connections.delete(input.connection.ws);
  input.rejectPendingRequestsForSocket({
    ws: input.connection.ws,
    error: new Error('插件连接已断开'),
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
  });
  if (!input.connection.pluginName) {
    return;
  }

  const activeConnection = input.connectionByPluginId.get(input.connection.pluginName);
  if (activeConnection?.ws !== input.connection.ws) {
    input.logInfo?.(`插件 "${input.connection.pluginName}" 的旧连接已断开`);
    return;
  }

  input.connectionByPluginId.delete(input.connection.pluginName);
  try {
    await input.unregisterPlugin(input.connection.pluginName);
  } catch {
    return;
  }

  input.logInfo?.(`插件 "${input.connection.pluginName}" 已断开连接`);
}
