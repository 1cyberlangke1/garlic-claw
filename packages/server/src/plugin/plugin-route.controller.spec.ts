import type { ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { GlobalResponseInterceptor } from '../common/interceptors/global-response.interceptor';
import { PluginRouteController } from './plugin-route.controller';

describe('PluginRouteController', () => {
  const pluginRuntime = {
    invokeRoute: jest.fn(),
  };

  let controller: PluginRouteController;
  let responseInterceptor: GlobalResponseInterceptor<unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginRouteController(pluginRuntime as never);
    responseInterceptor = new GlobalResponseInterceptor();
  });

  it('forwards authenticated HTTP requests into the unified plugin route runtime', async () => {
    pluginRuntime.invokeRoute.mockResolvedValue({
      status: 200,
      headers: {
        'x-plugin-route': 'ok',
        'set-cookie': 'session=1',
      },
      body: {
        ok: true,
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'GET',
      params: {
        path: 'inspect/context',
      },
      headers: {
        authorization: 'Bearer token',
        cookie: 'refreshToken=secret',
        'x-request-id': 'req-1',
      },
      body: undefined,
    };

    await expect(
      controller.handleRoute(
        'user-1',
        'builtin.route-inspector',
        {
          conversationId: 'conversation-1',
        },
        req as never,
        res as never,
      ),
    ).resolves.toEqual({
      ok: true,
    });

    expect(pluginRuntime.invokeRoute).toHaveBeenCalledWith({
      pluginId: 'builtin.route-inspector',
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {
          'x-request-id': 'req-1',
        },
        query: {
          conversationId: 'conversation-1',
        },
        body: null,
      },
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('x-plugin-route', 'ok');
    expect(res.setHeader).not.toHaveBeenCalledWith('set-cookie', 'session=1');
  });

  it('supports named wildcard params produced by the route converter', async () => {
    pluginRuntime.invokeRoute.mockResolvedValue({
      status: 200,
      headers: {},
      body: {
        ok: true,
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'GET',
      params: {
        path: ['inspect', 'context'],
      },
      headers: {},
      body: undefined,
    };

    await expect(
      controller.handleRoute(
        'user-1',
        'builtin.route-inspector',
        {},
        req as never,
        res as never,
      ),
    ).resolves.toEqual({
      ok: true,
    });

    expect(pluginRuntime.invokeRoute).toHaveBeenCalledWith({
      pluginId: 'builtin.route-inspector',
      request: expect.objectContaining({
        path: 'inspect/context',
      }),
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: undefined,
      },
    });
  });

  it('rejects unsupported http methods before dispatching into plugin runtime', async () => {
    const res = createResponseStub();
    const req = {
      method: 'HEAD',
      params: {
        path: 'inspect/context',
      },
      headers: {},
      body: undefined,
    };

    await expect(
      controller.handleRoute(
        'user-1',
        'builtin.route-inspector',
        {},
        req as never,
        res as never,
      ),
    ).rejects.toThrow('插件 Route 暂不支持 HTTP 方法 HEAD');

    expect(pluginRuntime.invokeRoute).not.toHaveBeenCalled();
  });

  it('keeps plugin route dynamic error status aligned with envelope code', async () => {
    pluginRuntime.invokeRoute.mockResolvedValue({
      status: 403,
      headers: {},
      body: {
        message: 'forbidden by plugin governance',
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'GET',
      params: {
        path: 'inspect/context',
      },
      headers: {},
      body: undefined,
    };

    const routePayload = await controller.handleRoute(
      'user-1',
      'builtin.route-inspector',
      {},
      req as never,
      res as never,
    );
    const envelope = await firstValueFrom(
      responseInterceptor.intercept(
        createHttpExecutionContext(res),
        {
          handle: () => of(routePayload),
        },
      ),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(envelope).toEqual({
      code: 403,
      message: 'forbidden by plugin governance',
      data: null,
    });
  });

  it('keeps plugin route success payload wrapped as code=0 with original http status', async () => {
    pluginRuntime.invokeRoute.mockResolvedValue({
      status: 202,
      headers: {},
      body: {
        accepted: true,
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'POST',
      params: {
        path: 'inspect/context',
      },
      headers: {},
      body: {
        echo: true,
      },
    };

    const routePayload = await controller.handleRoute(
      'user-1',
      'builtin.route-inspector',
      {},
      req as never,
      res as never,
    );
    const envelope = await firstValueFrom(
      responseInterceptor.intercept(
        createHttpExecutionContext(res),
        {
          handle: () => of(routePayload),
        },
      ),
    );

    expect(res.status).toHaveBeenCalledWith(202);
    expect(envelope).toEqual({
      code: 0,
      message: '',
      data: {
        accepted: true,
      },
    });
  });
});

/**
 * 创建最小响应对象桩。
 * @returns 仅包含控制器测试所需方法的响应对象
 */
function createResponseStub(): Pick<Response, 'status' | 'setHeader' | 'getHeader'> & {
  statusCode: number;
} {
  return {
    statusCode: 200,
    status: jest.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    setHeader: jest.fn(),
    getHeader: jest.fn().mockReturnValue(undefined),
  } as never;
}

function createHttpExecutionContext(
  response: Pick<Response, 'statusCode' | 'getHeader'>,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as ExecutionContext;
}
