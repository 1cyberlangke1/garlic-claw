import {
  DeviceType,
  WS_ACTION,
  WS_TYPE,
  type PluginManifest,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  authenticatePluginGatewayConnection,
  disconnectPluginGatewayConnection,
  registerPluginGatewayConnection,
} from './plugin-gateway-lifecycle.helpers';
import type { PluginTransport } from './plugin-runtime.types';

describe('plugin-gateway-lifecycle.helpers', () => {
  const manifest: PluginManifest = {
    id: 'remote.pc-host',
    name: '电脑助手',
    version: '1.0.0',
    runtime: 'remote',
    permissions: ['conversation:read'],
    tools: [],
    hooks: [],
    routes: [],
  };

  it('authenticates connections, replaces older sockets, and sends auth ok', async () => {
    const ws = createSocketStub();
    const oldSocket = createSocketStub();
    const connectionByPluginId = new Map<string, { ws: WebSocket }>([
      ['remote.pc-host', { ws: oldSocket }],
    ]);
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };

    await authenticatePluginGatewayConnection({
      ws,
      connection: conn,
      payload: {
        token: 'token-1',
        pluginName: 'remote.pc-host',
        deviceType: DeviceType.PC,
      },
      verifyToken: () => ({
        role: 'admin',
      }),
      connectionByPluginId,
      logWarn: jest.fn(),
      logInfo: jest.fn(),
      sendMessage: ({ ws: target, type, action, payload }: {
        ws: WebSocket;
        type: string;
        action: string;
        payload: unknown;
      }) =>
        target.send(JSON.stringify({ type, action, payload })),
    });

    expect(conn).toEqual(
      expect.objectContaining({
        authenticated: true,
        pluginName: 'remote.pc-host',
        deviceType: 'pc',
      }),
    );
    expect(oldSocket.close).toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTH_OK,
      payload: {},
    });
  });

  it('authenticates remote bootstrap tokens when plugin identity matches the token claims', async () => {
    const ws = createSocketStub();
    const connectionByPluginId = new Map<string, { ws: WebSocket }>();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };

    await authenticatePluginGatewayConnection({
      ws,
      connection: conn,
      payload: {
        token: 'remote-bootstrap-token',
        pluginName: 'remote.pc-host',
        deviceType: DeviceType.PC,
      },
      verifyToken: () => ({
        role: 'remote_plugin',
        authKind: 'remote-plugin',
        pluginName: 'remote.pc-host',
        deviceType: 'pc',
      }),
      connectionByPluginId,
      logWarn: jest.fn(),
      logInfo: jest.fn(),
      sendMessage: ({ ws: target, type, action, payload }: {
        ws: WebSocket;
        type: string;
        action: string;
        payload: unknown;
      }) =>
        target.send(JSON.stringify({ type, action, payload })),
    });

    expect(conn).toEqual(
      expect.objectContaining({
        authenticated: true,
        pluginName: 'remote.pc-host',
        deviceType: 'pc',
      }),
    );
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTH_OK,
      payload: {},
    });
  });

  it('rejects remote bootstrap tokens when the token claims do not match the requested plugin identity', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };

    await expect(
      authenticatePluginGatewayConnection({
        ws,
        connection: conn,
        payload: {
          token: 'remote-bootstrap-token',
          pluginName: 'remote.pc-host',
          deviceType: DeviceType.PC,
        },
        verifyToken: () => ({
          role: 'remote_plugin',
          authKind: 'remote-plugin',
          pluginName: 'remote.other-host',
          deviceType: 'pc',
        }),
        connectionByPluginId: new Map<string, { ws: WebSocket }>(),
        logWarn: jest.fn(),
        logInfo: jest.fn(),
        sendMessage: ({ ws: target, type, action, payload }: {
          ws: WebSocket;
          type: string;
          action: string;
          payload: unknown;
        }) =>
          target.send(JSON.stringify({ type, action, payload })),
      }),
    ).rejects.toThrow('远程插件令牌与当前插件标识不匹配');
    expect(conn.authenticated).toBe(false);
  });

  it('registers manifests and disconnects only the active connection', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: null as PluginManifest | null,
      lastHeartbeatAt: Date.now(),
    };
    const connectionByPluginId = new Map<string, { ws: WebSocket }>([
      ['remote.pc-host', conn],
    ]);
    const pendingReject = jest.fn();
    const timer = setTimeout(() => undefined, 60_000);
    const pendingRequests = new Map([
      [
        'request-1',
        {
          ws,
          timer,
          resolve: jest.fn(),
          reject: pendingReject,
        },
      ],
    ]);
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws,
          context: {
            source: 'plugin' as const,
          },
        },
      ],
    ]);
    const unregisterPlugin = jest.fn().mockResolvedValue(undefined);

    await registerPluginGatewayConnection({
      ws,
      connection: conn,
      payload: {
        manifest: manifest as unknown as Record<string, unknown>,
      },
      resolveManifest: ({ manifest: manifestInput }: {
        pluginName: string;
        manifest: Record<string, unknown> | null | undefined;
      }) => manifestInput as unknown as PluginManifest,
      createTransport: () =>
        ({
          executeTool: jest.fn(),
          invokeHook: jest.fn(),
          invokeRoute: jest.fn(),
        }) as PluginTransport,
      registerPlugin: jest.fn().mockResolvedValue(undefined),
      sendMessage: ({ ws: target, type, action, payload }: {
        ws: WebSocket;
        type: string;
        action: string;
        payload: unknown;
      }) =>
        target.send(JSON.stringify({ type, action, payload })),
    });

    expect(conn.manifest).toEqual(manifest);
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER_OK,
      payload: {},
    });

    await disconnectPluginGatewayConnection({
      connection: conn,
      connections: new Map([[ws, conn]]),
      connectionByPluginId,
      pendingRequests,
      activeRequestContexts,
      unregisterPlugin,
      rejectPendingRequestsForSocket: ({ error }: {
        ws: WebSocket;
        error: Error;
        pendingRequests: Map<string, unknown>;
        activeRequestContexts: Map<string, unknown>;
      }) => {
        clearTimeout(timer);
        pendingRequests.clear();
        activeRequestContexts.clear();
        pendingReject(error);
      },
      logInfo: jest.fn(),
    });

    expect(unregisterPlugin).toHaveBeenCalledWith('remote.pc-host');
    expect(pendingReject).toHaveBeenCalledWith(new Error('插件连接已断开'));
    expect(connectionByPluginId.has('remote.pc-host')).toBe(false);
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
    close: jest.Mock;
  };
}
