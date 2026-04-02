import { WebSocket } from 'ws';
import {
  handlePluginGatewayErrorMessage,
  handlePluginGatewayResultMessage,
} from './plugin-gateway-dispatch.helpers';

describe('plugin-gateway-dispatch.helpers', () => {
  it('resolves pending request data and rejects malformed payloads with supplied messages', async () => {
    const ws = createSocketStub();
    const pendingRequests = new Map();
    const activeRequestContexts = new Map();
    const loggerWarn = jest.fn();

    const successPromise = new Promise((resolve, reject) => {
      pendingRequests.set('request-1', {
        ws,
        timer: setTimeout(() => undefined, 60_000),
        resolve,
        reject,
      });
      activeRequestContexts.set('request-1', {
        ws,
        context: {
          source: 'plugin',
        },
      });
    });

    handlePluginGatewayResultMessage({
      msg: {
        type: 'plugin',
        action: 'hook_result',
        requestId: 'request-1',
      },
      pendingRequests,
      activeRequestContexts,
      loggerWarn,
      invalidPayloadMessage: '无效的 Hook 返回负载',
      readPayload: (payload: unknown) =>
        payload && typeof payload === 'object' && 'data' in payload
          ? {
            data: {
              ok: true,
            },
          }
          : null,
    }, {
      data: {
        ok: true,
      },
    });

    await expect(successPromise).resolves.toEqual({
      ok: true,
    });

    const invalidPromise = new Promise((resolve, reject) => {
      pendingRequests.set('request-2', {
        ws,
        timer: setTimeout(() => undefined, 60_000),
        resolve,
        reject,
      });
      activeRequestContexts.set('request-2', {
        ws,
        context: {
          source: 'plugin',
        },
      });
    });

    handlePluginGatewayResultMessage({
      msg: {
        type: 'plugin',
        action: 'hook_result',
        requestId: 'request-2',
      },
      pendingRequests,
      activeRequestContexts,
      loggerWarn,
      invalidPayloadMessage: '无效的 Hook 返回负载',
      readPayload: () => null,
    }, {
      bad: true,
    });

    await expect(invalidPromise).rejects.toThrow('无效的 Hook 返回负载');
  });

  it('rejects pending request errors and ignores messages without request ids', async () => {
    const ws = createSocketStub();
    const pendingRequests = new Map();
    const activeRequestContexts = new Map();
    const loggerWarn = jest.fn();

    const failurePromise = new Promise((resolve, reject) => {
      pendingRequests.set('request-3', {
        ws,
        timer: setTimeout(() => undefined, 60_000),
        resolve,
        reject,
      });
      activeRequestContexts.set('request-3', {
        ws,
        context: {
          source: 'plugin',
        },
      });
    });

    handlePluginGatewayErrorMessage({
      msg: {
        type: 'plugin',
        action: 'hook_error',
        requestId: 'request-3',
      },
      pendingRequests,
      activeRequestContexts,
      loggerWarn,
      invalidPayloadMessage: '无效的 Hook 错误负载',
      readPayload: (payload: unknown) => (
        payload && typeof payload === 'object' && 'error' in payload
          ? {
            error: String((payload as { error: unknown }).error),
          }
          : null
      ),
    }, {
      error: 'bad payload',
    });

    await expect(failurePromise).rejects.toThrow('bad payload');

    handlePluginGatewayErrorMessage({
      msg: {
        type: 'plugin',
        action: 'hook_error',
      },
      pendingRequests,
      activeRequestContexts,
      loggerWarn,
      invalidPayloadMessage: '无效的 Hook 错误负载',
      readPayload: () => null,
    }, null);

    expect(loggerWarn).toHaveBeenCalledWith(
      '收到缺少 requestId 的插件消息: plugin/hook_error',
    );
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;
}
