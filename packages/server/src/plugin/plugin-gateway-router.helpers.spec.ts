import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  handlePluginGatewayCommandMessage,
  handlePluginGatewayPluginMessage,
} from './plugin-gateway-router.helpers';

describe('plugin-gateway-router.helpers', () => {
  it('rejects malformed register payloads before register handlers run', async () => {
    const ws = createSocketStub();
    const onRegister = jest.fn();

    await handlePluginGatewayPluginMessage({
      ws,
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: null,
      },
      pendingRequests: new Map(),
      activeRequestContexts: new Map(),
      protocolErrorAction: 'protocol_error',
      onRegister,
      onHostCall: jest.fn(),
    });

    expect(onRegister).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'protocol_error',
      payload: { error: '无效的插件注册负载' },
    });
  });

  it('routes route results through the shared pending-request resolver', async () => {
    const timer = setTimeout(() => undefined, 60_000);
    const resolve = jest.fn();
    const reject = jest.fn();
    const socket = createSocketStub();
    const pendingRequests = new Map([
      [
        'request-1',
        {
          ws: socket,
          timer,
          resolve,
          reject,
        },
      ],
    ]);
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws: socket,
          context: {
            source: 'plugin' as const,
          },
        },
      ],
    ]);

    await handlePluginGatewayPluginMessage({
      ws: socket,
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_RESULT,
        requestId: 'request-1',
        payload: {
          data: {
            status: 200,
            body: {
              ok: true,
            },
          },
        },
      },
      pendingRequests,
      activeRequestContexts,
      protocolErrorAction: 'protocol_error',
      onRegister: jest.fn(),
      onHostCall: jest.fn(),
    });

    expect(resolve).toHaveBeenCalledWith({
      status: 200,
      body: {
        ok: true,
      },
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it('routes command errors through the shared pending-request rejecter', () => {
    const timer = setTimeout(() => undefined, 60_000);
    const reject = jest.fn();
    const socket = createSocketStub();
    const pendingRequests = new Map([
      [
        'request-1',
        {
          ws: socket,
          timer,
          resolve: jest.fn(),
          reject,
        },
      ],
    ]);
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws: socket,
          context: {
            source: 'plugin' as const,
          },
        },
      ],
    ]);

    handlePluginGatewayCommandMessage({
      msg: {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_ERROR,
        requestId: 'request-1',
        payload: {
          error: 'remote boom',
        },
      },
      pendingRequests,
      activeRequestContexts,
    });

    expect(reject).toHaveBeenCalledWith(new Error('remote boom'));
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
