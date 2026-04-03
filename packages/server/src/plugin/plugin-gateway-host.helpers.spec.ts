import {
  WS_ACTION,
  WS_TYPE,
  type HostCallPayload,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import { handlePluginGatewayHostCall } from './plugin-gateway-host.helpers';

describe('plugin-gateway-host.helpers', () => {
  it('delegates approved host calls and sends host results', async () => {
    const ws = createSocketStub();
    const callHost = jest.fn().mockResolvedValue([
      {
        id: 'memory-1',
        content: '用户喜欢咖啡',
      },
    ]);

    await handlePluginGatewayHostCall({
      ws,
      connection: {
        ws,
        pluginName: 'remote.pc-host',
      },
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-1',
        payload: {
          method: 'memory.search',
          context: {
            source: 'chat-tool',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          params: {
            query: '咖啡',
            limit: 3,
          },
        } satisfies HostCallPayload,
      },
      activeRequestContexts: new Map([
        [
          'runtime-request-1',
          {
            ws,
            context: {
              source: 'chat-tool',
              userId: 'user-1',
              conversationId: 'conversation-1',
            },
          },
        ],
      ]),
      callHost,
    });

    expect(callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.search',
      params: {
        query: '咖啡',
        limit: 3,
      },
    });
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_RESULT,
      requestId: 'request-1',
      payload: {
        data: [
          {
            id: 'memory-1',
            content: '用户喜欢咖啡',
          },
        ],
      },
    });
  });

  it('rejects malformed host payloads before they reach the runtime', async () => {
    const ws = createSocketStub();
    const callHost = jest.fn();

    await handlePluginGatewayHostCall({
      ws,
      connection: {
        ws,
        pluginName: 'remote.pc-host',
      },
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-bad-host',
        payload: {
          method: 'plugin.self.get',
          params: 'bad-params',
        },
      },
      activeRequestContexts: new Map(),
      callHost,
    });

    expect(callHost).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      requestId: 'request-bad-host',
      payload: {
        error: '无效的 Host API 调用负载',
      },
    });
  });

  it('allows connection-scoped host calls without an approved runtime context', async () => {
    const ws = createSocketStub();
    const callHost = jest.fn().mockResolvedValue({
      id: 'remote.pc-host',
      name: '电脑助手',
    });

    await handlePluginGatewayHostCall({
      ws,
      connection: {
        ws,
        pluginName: 'remote.pc-host',
      },
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-plugin-self',
        payload: {
          method: 'plugin.self.get',
          params: {},
        },
      },
      activeRequestContexts: new Map(),
      callHost,
    });

    expect(callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: {
        source: 'plugin',
      },
      method: 'plugin.self.get',
      params: {},
    });
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_RESULT,
      requestId: 'request-plugin-self',
      payload: {
        data: {
          id: 'remote.pc-host',
          name: '电脑助手',
        },
      },
    });
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
