import type { PluginCallContext, PluginRouteResponse } from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  checkPluginGatewayHealth,
  createPluginGatewayRemoteTransport,
  sweepStalePluginGatewayConnections,
} from './plugin-gateway-runtime.helpers';
import { resolvePluginGatewayPendingRequest } from './plugin-gateway-transport.helpers';

describe('plugin-gateway-runtime.helpers', () => {
  it('creates remote transport requests that reuse transport helpers and route readers', async () => {
    const ws = createSocketStub();
    const pendingRequests = new Map();
    const activeRequestContexts = new Map();
    const transport = createPluginGatewayRemoteTransport({
      connection: {
        ws,
        pluginName: 'remote.pc-host',
      },
      pendingRequests,
      activeRequestContexts,
      disconnectPlugin: jest.fn().mockResolvedValue(undefined),
      checkPluginHealth: jest.fn().mockResolvedValue({ ok: true }),
    });

    const toolContext: PluginCallContext = {
      source: 'automation',
      userId: 'user-1',
      automationId: 'automation-1',
    };
    const toolPromise = transport.executeTool({
      toolName: 'list_directory',
      params: {
        dirPath: 'C:\\\\',
      },
      context: toolContext,
    });
    const toolMessage = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
    expect(toolMessage).toEqual({
      type: WS_TYPE.COMMAND,
      action: WS_ACTION.EXECUTE,
      requestId: expect.any(String),
      payload: {
        toolName: 'list_directory',
        params: {
          dirPath: 'C:\\\\',
        },
        context: toolContext,
      },
    });

    resolvePluginGatewayPendingRequest({
      requestId: toolMessage.requestId,
      data: {
        entries: ['Users', 'Windows'],
      },
      pendingRequests,
      activeRequestContexts,
    });
    await expect(toolPromise).resolves.toEqual({
      entries: ['Users', 'Windows'],
    });

    const routeContext: PluginCallContext = {
      source: 'http-route',
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const routePromise = transport.invokeRoute({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
        query: {},
        body: null,
      },
      context: routeContext,
    });
    const routeMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
    expect(routeMessage).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.ROUTE_INVOKE,
      requestId: expect.any(String),
      payload: {
        request: {
          path: 'inspect/context',
          method: 'GET',
          headers: {},
          query: {},
          body: null,
        },
        context: routeContext,
      },
    });

    resolvePluginGatewayPendingRequest({
      requestId: routeMessage.requestId,
      data: {
        status: 200,
        body: {
          ok: true,
        },
      } satisfies PluginRouteResponse,
      pendingRequests,
      activeRequestContexts,
    });
    await expect(routePromise).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
      },
    });
    expect(transport.listSupportedActions!()).toEqual([
      'health-check',
      'reload',
      'reconnect',
    ]);
  });

  it('checks plugin health by waiting for websocket pong and sweeps stale connections', async () => {
    const ws = createSocketStub();
    const healthPromise = checkPluginGatewayHealth({
      pluginId: 'remote.pc-host',
      connection: {
        ws,
      },
      timeoutMs: 5000,
    });
    const pongHandler = ws.once.mock.calls.find((call) => call[0] === 'pong')?.[1];
    expect(typeof pongHandler).toBe('function');
    pongHandler();
    await expect(healthPromise).resolves.toEqual({
      ok: true,
    });

    const staleSocket = createSocketStub();
    const freshSocket = createSocketStub();
    sweepStalePluginGatewayConnections({
      now: Date.now(),
      heartbeatTimeoutMs: 90_000,
      connections: [
        {
          ws: staleSocket,
          pluginName: 'remote.stale-host',
          authenticated: true,
          lastHeartbeatAt: Date.now() - 120_000,
        },
        {
          ws: freshSocket,
          pluginName: 'remote.fresh-host',
          authenticated: true,
          lastHeartbeatAt: Date.now(),
        },
      ],
      onStaleConnection: jest.fn(),
    });

    expect(staleSocket.close).toHaveBeenCalled();
    expect(freshSocket.close).not.toHaveBeenCalled();
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    ping: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
    close: jest.Mock;
    once: jest.Mock;
    off: jest.Mock;
    ping: jest.Mock;
  };
}
