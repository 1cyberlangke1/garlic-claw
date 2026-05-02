import type { WsMessage } from '@garlic-claw/shared';
import { Injectable, Logger } from '@nestjs/common';
import { RuntimeGatewayConnectionLifecycleService } from '../../runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../runtime/gateway/runtime-gateway-remote-transport.service';
import { PluginHostService } from '../../runtime/host/plugin-host.service';
import {
  createWsReply,
  type PluginWsInboundResult,
  readAuthPayload,
  readHostCallPayload,
  readRegisterPayload,
  readRemoteSettlement,
} from './plugin-ws.protocol';
import { WS_ACTION, WS_TYPE } from './plugin-ws-message.constants';

@Injectable()
export class PluginWsInboundService {
  private readonly logger = new Logger(PluginWsInboundService.name);
  constructor(
    private readonly runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
    private readonly runtimeGatewayRemoteTransportService: RuntimeGatewayRemoteTransportService,
    private readonly runtimeHostService: PluginHostService,
  ) {}
  async handleMessage({ connectionId, message }: {
    connectionId: string;
    message: WsMessage;
  }): Promise<PluginWsInboundResult | void> {
    if ((message.type !== WS_TYPE.AUTH || message.action !== WS_ACTION.AUTHENTICATE) && !this.runtimeGatewayConnectionLifecycleService.getConnection(connectionId)?.authenticated) {
      return { reply: createWsReply(WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '未认证' }) };
    }
    const settlement = readRemoteSettlement(message);
    if (settlement) {
      if ('missingRequestId' in settlement) {
        this.logger.warn(`收到缺少 requestId 的插件消息: ${message.type}/${message.action}`);
        return;
      }
      this.runtimeGatewayRemoteTransportService.settlePendingRequest(settlement.settlement);
      return;
    }
    switch (`${message.type}:${message.action}`) {
      case `${WS_TYPE.AUTH}:${WS_ACTION.AUTHENTICATE}`: return { reply: this.authenticateConnection(connectionId, message.payload) };
      case `${WS_TYPE.PLUGIN}:${WS_ACTION.REGISTER}`:
        return this.registerRemotePlugin(connectionId, message.payload);
      case `${WS_TYPE.PLUGIN}:${WS_ACTION.HOST_CALL}`:
        return this.handleHostCall(connectionId, message);
      case `${WS_TYPE.HEARTBEAT}:${WS_ACTION.PING}`:
        this.runtimeGatewayConnectionLifecycleService.touchConnectionHeartbeat(connectionId);
        return { reply: createWsReply(WS_TYPE.HEARTBEAT, WS_ACTION.PONG, {}) };
      default: return { reply: createWsReply(WS_TYPE.ERROR, 'protocol_error', { error: '无效的插件协议消息' }) };
    }
  }
  private authenticateConnection(connectionId: string, payload: unknown): WsMessage {
    let authPayload;
    try {
      authPayload = readAuthPayload(payload);
    } catch {
      return createWsReply(WS_TYPE.ERROR, 'protocol_error', { error: '无效的认证负载' });
    }
    try {
      this.runtimeGatewayConnectionLifecycleService.authenticateConnection({
        accessKey: authPayload.accessKey ?? null,
        connectionId,
        pluginName: authPayload.pluginName,
        remoteEnvironment: authPayload.remoteEnvironment,
      });
      return createWsReply(WS_TYPE.AUTH, WS_ACTION.AUTH_OK, {});
    } catch (error) {
      return createWsReply(WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: error instanceof Error ? error.message : '认证失败' });
    }
  }
  private async handleHostCall(connectionId: string, message: WsMessage): Promise<PluginWsInboundResult | void> {
    const requestId = this.readRequestId(message);
    if (!requestId) {return;}
    let hostPayload;
    try {
      hostPayload = readHostCallPayload(message.payload);
    } catch (error) {
      return { reply: createWsReply(WS_TYPE.PLUGIN, WS_ACTION.HOST_ERROR, { error: error instanceof Error ? error.message : '无效的 Host API 调用负载' }, requestId) };
    }
    try {
      const data = await this.runtimeHostService.call({
        context: this.runtimeGatewayRemoteTransportService.resolveHostCallContext({
          connectionId,
          context: hostPayload.context,
          method: hostPayload.method,
        }),
        method: hostPayload.method,
        params: hostPayload.params,
        pluginId: this.runtimeGatewayConnectionLifecycleService.getConnection(connectionId)?.pluginId ?? '',
      });
      return { reply: createWsReply(WS_TYPE.PLUGIN, WS_ACTION.HOST_RESULT, { data }, requestId) };
    } catch (error) {
      return { reply: createWsReply(WS_TYPE.PLUGIN, WS_ACTION.HOST_ERROR, { error: error instanceof Error ? error.message : String(error) }, requestId) };
    }
  }
  private readRequestId(message: WsMessage): string | null {
    if (typeof message.requestId === 'string' && message.requestId.length > 0) {return message.requestId;}
    this.logger.warn(`收到缺少 requestId 的插件消息: ${message.type}/${message.action}`);
    return null;
  }
  private registerRemotePlugin(connectionId: string, payload: unknown): PluginWsInboundResult {
    const connection = this.runtimeGatewayConnectionLifecycleService.getConnection(connectionId);
    if (!connection?.pluginId) {return { reply: createWsReply(WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '未认证' }) };}
    let registerPayload;
    try {
      registerPayload = readRegisterPayload(payload);
    } catch {
      return { reply: createWsReply(WS_TYPE.ERROR, 'protocol_error', { error: '无效的插件注册负载' }) };
    }
    try {
      this.runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
        connectionId,
        fallback: { id: connection.pluginId, name: registerPayload.manifest.name, runtime: 'remote' },
        manifest: registerPayload.manifest,
        remoteEnvironment: connection.remoteEnvironment ?? 'api',
      });
      return { flushOutbound: true, reply: createWsReply(WS_TYPE.PLUGIN, WS_ACTION.REGISTER_OK, {}) };
    } catch (error) {
      return { reply: createWsReply(WS_TYPE.ERROR, 'protocol_error', { error: error instanceof Error ? error.message : '无效的插件注册负载' }) };
    }
  }
}
