import {
  assertPluginGatewayAuthClaims,
  createPluginGatewayRemoteTransport,
  handlePluginGatewayCommandMessage,
  handlePluginGatewayHostCall,
  handlePluginGatewayInboundRawMessage,
  handlePluginGatewayMessageEnvelope,
  handlePluginGatewayPluginMessage,
  rejectPluginGatewayPendingRequestsForSocket,
  sendPluginGatewayMessage,
  type ActiveRequestContext,
  type AuthPayload,
  type PendingRequest,
  type PluginGatewayVerifiedToken,
  type PluginGatewayInboundMessage,
  type PluginGatewayPayload,
  type PluginManifest,
  type ValidatedRegisterPayload,
  DeviceType,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocket, WebSocketServer } from 'ws';
import { normalizePluginManifestCandidate } from './plugin-manifest.persistence';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';

const HEARTBEAT_SWEEP_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const AUTH_TIMEOUT_MS = 10_000;
const PROTOCOL_ERROR_ACTION = 'protocol_error';

interface PluginConnection {
  ws: WebSocket;
  pluginName: string;
  deviceType: string;
  authenticated: boolean;
  manifest: PluginManifest | null;
  lastHeartbeatAt: number;
}

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

@Injectable()
export class PluginGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginGateway.name);
  private wss!: WebSocketServer;
  private readonly connections = new Map<WebSocket, PluginConnection>();
  private readonly connectionByPluginId = new Map<string, PluginConnection>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly activeRequestContexts = new Map<string, ActiveRequestContext>();
  private heartbeatInterval!: ReturnType<typeof setInterval>;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginRuntimeOrchestrator: PluginRuntimeOrchestratorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const port = this.configService.get<number>('WS_PORT', 23331);
    this.wss = new WebSocketServer({ port });
    this.logger.log(`插件 WebSocket 服务器监听端口 ${port}`);
    this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), HEARTBEAT_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      this.activeRequestContexts.delete(requestId);
      pending.reject(new Error('服务器关闭'));
    }
    this.pendingRequests.clear();
    this.wss?.close();
  }

  async disconnectPlugin(pluginId: string): Promise<void> {
    this.getConnectedPluginOrThrow(pluginId).ws.close();
  }

  async checkPluginHealth(
    pluginId: string,
    timeoutMs = 5000,
  ): Promise<{ ok: boolean }> {
    const connection = this.getConnectedPluginOrThrow(pluginId);
    if (connection.ws.readyState !== WebSocket.OPEN) return { ok: false };

    return new Promise<{ ok: boolean }>((resolve, reject) => {
      const handlePong = () => {
        clearTimeout(timer);
        connection.ws.off('pong', handlePong);
        resolve({ ok: true });
      };
      const timer = setTimeout(() => {
        connection.ws.off('pong', handlePong);
        reject(new Error(`插件健康检查超时: ${pluginId}`));
      }, timeoutMs);

      connection.ws.once('pong', handlePong);
      connection.ws.ping();
    });
  }

  private handleConnection(ws: WebSocket) {
    const connection = this.createConnectionRecord(ws);
    this.connections.set(ws, connection);
    const logWarn = (message: string) => this.logger.warn(message);

    const authTimeout = setTimeout(() => {
      if (connection.authenticated) {
        return;
      }

      this.sendSocketMessage(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' });
      ws.close();
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw: Buffer) => {
      void handlePluginGatewayInboundRawMessage({
        socket: ws,
        raw,
        protocolErrorAction: PROTOCOL_ERROR_ACTION,
        handleMessage: (message) => this.handleMessage(ws, connection, message),
        logWarn,
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      void this.handleDisconnect(connection);
    });

    ws.on('error', (error) => {
      this.logger.error(`来自 "${connection.pluginName}" 的 WS 错误：${error.message}`);
    });
  }

  private async handleMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    const logWarn = (message: string) => this.logger.warn(message);
    await handlePluginGatewayMessageEnvelope({
      socket: ws,
      connection: conn,
      msg,
      protocolErrorAction: PROTOCOL_ERROR_ACTION,
      onAuth: (payload) => this.handleAuth(ws, conn, payload),
      onPluginMessage: async (message) => {
        await handlePluginGatewayPluginMessage({
          socket: ws,
          msg: message,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          protocolErrorAction: PROTOCOL_ERROR_ACTION,
          onRegister: (payload) => this.registerPluginConnection(ws, conn, payload),
          onHostCall: (hostCallMessage) =>
            handlePluginGatewayHostCall({
              socket: ws,
              connection: {
                socket: conn.ws,
                pluginName: conn.pluginName,
              },
              msg: hostCallMessage,
              activeRequestContexts: this.activeRequestContexts,
              callHost: (input) => this.pluginRuntime.callHost(input),
              logWarn,
            }),
          logWarn,
        });
      },
      onCommandMessage: async (message) => {
        handlePluginGatewayCommandMessage({
          msg: message,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          logWarn,
        });
      },
      onHeartbeatPing: async () => {
        if (conn.manifest) {
          await this.pluginRuntimeOrchestrator.touchPluginHeartbeat(conn.pluginName);
        }
        this.sendSocketMessage(ws, WS_TYPE.HEARTBEAT, WS_ACTION.PONG);
      },
    });
  }

  private async handleAuth(
    ws: WebSocket,
    conn: PluginConnection,
    payload: AuthPayload,
  ): Promise<void> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'fallback-secret');
      const verified = this.jwtService.verify<PluginGatewayVerifiedToken>(payload.token, {
        secret,
      });
      assertPluginGatewayAuthClaims({ verified, payload });

      const previousConnection = this.connectionByPluginId.get(payload.pluginName);
      conn.authenticated = true;
      conn.pluginName = payload.pluginName;
      conn.deviceType = payload.deviceType;
      conn.lastHeartbeatAt = Date.now();
      this.connectionByPluginId.set(payload.pluginName, conn);

      if (previousConnection && previousConnection.ws !== ws) {
        this.logger.warn(`插件 "${payload.pluginName}" 已存在旧连接，当前将其替换`);
        previousConnection.ws.close();
      }

      this.sendSocketMessage(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_OK);
      this.logger.log(`Plugin "${payload.pluginName}" authenticated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      this.sendSocketMessage(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_FAIL, { error: message });
      ws.close();
    }
  }

  private async registerPluginConnection(
    ws: WebSocket,
    connection: PluginConnection,
    payload: ValidatedRegisterPayload,
  ): Promise<void> {
    const manifest = resolvePluginGatewayManifest({
      pluginName: connection.pluginName,
      manifest: payload.manifest as unknown as Record<string, unknown>,
    });
    connection.manifest = manifest;

    await this.pluginRuntimeOrchestrator.registerPlugin({
      manifest,
      runtimeKind: 'remote',
      deviceType: connection.deviceType,
      transport: createPluginGatewayRemoteTransport({
        connection,
        pendingRequests: this.pendingRequests,
        activeRequestContexts: this.activeRequestContexts,
        disconnectPlugin: (pluginId: string) => this.disconnectPlugin(pluginId),
        checkPluginHealth: (pluginId: string) => this.checkPluginHealth(pluginId),
      }),
    });

    this.sendSocketMessage(ws, WS_TYPE.PLUGIN, WS_ACTION.REGISTER_OK);
  }

  private async handleDisconnect(conn: PluginConnection): Promise<void> {
    this.connections.delete(conn.ws);
    rejectPluginGatewayPendingRequestsForSocket({
      socket: conn.ws,
      error: new Error('插件连接已断开'),
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
    });
    if (!conn.pluginName) {
      return;
    }

    const activeConnection = this.connectionByPluginId.get(conn.pluginName);
    if (activeConnection?.ws !== conn.ws) {
      this.logger.log(`插件 "${conn.pluginName}" 的旧连接已断开`);
      return;
    }

    this.connectionByPluginId.delete(conn.pluginName);
    try {
      await this.pluginRuntimeOrchestrator.unregisterPlugin(conn.pluginName);
    } catch {
      return;
    }

    this.logger.log(`插件 "${conn.pluginName}" 已断开连接`);
  }

  private checkHeartbeats() {
    const now = Date.now();
    for (const connection of this.connections.values()) {
      if (!connection.authenticated) {
        continue;
      }

      const lastHeartbeatAt = typeof connection.lastHeartbeatAt === 'number'
        ? connection.lastHeartbeatAt
        : now;
      if (now - lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) {
        continue;
      }

      this.logger.warn(
        `插件 "${connection.pluginName || 'unknown'}" 心跳超时，主动断开连接`,
      );
      connection.ws.close();
    }
  }

  private createConnectionRecord(ws: WebSocket, now = Date.now()): PluginConnection {
    return {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: now,
    };
  }

  private sendSocketMessage(
    socket: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload = {},
  ): void {
    sendPluginGatewayMessage({
      socket,
      type,
      action,
      payload,
    });
  }

  private getConnectedPluginOrThrow(pluginId: string): PluginConnection {
    const connection = this.connectionByPluginId.get(pluginId);
    if (!connection) throw new NotFoundException(`Plugin not connected: ${pluginId}`);
    return connection;
  }
}

export { DeviceType };
