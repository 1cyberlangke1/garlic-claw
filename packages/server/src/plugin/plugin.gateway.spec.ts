import {
  WS_ACTION,
  WS_TYPE,
  type HostCallPayload,
  type PluginManifest,
  type RegisterPayload,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import { PluginGateway, resolvePluginGatewayManifest } from './plugin.gateway';

describe('PluginGateway', () => {
  const pluginRuntime = {
    callHost: jest.fn(),
  };
  const pluginRuntimeOrchestrator = {
    registerPlugin: jest.fn(),
    unregisterPlugin: jest.fn(),
    touchPluginHeartbeat: jest.fn(),
  };

  const jwtService = {
    verify: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback: unknown) => fallback),
  };

  const remoteManifest: PluginManifest = {
    id: 'remote.pc-host',
    name: '电脑助手',
    version: '1.0.0',
    runtime: 'remote',
    permissions: ['conversation:read'],
    tools: [
      {
        name: 'list_directory',
        description: '列目录',
        parameters: {
          dirPath: {
            type: 'string',
            required: true,
          },
        },
      },
    ],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
  };

  let gateway: PluginGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new PluginGateway(
      pluginRuntime as never,
      pluginRuntimeOrchestrator as never,
      jwtService as never,
      configService as never,
    );
  });

  it('creates an unauthenticated connection record and closes the socket when auth times out', () => {
    jest.useFakeTimers();
    try {
      const ws = createSocketStub();

      (gateway as any).handleConnection(ws);

      expect((gateway as any).connections.get(ws)).toEqual({
        ws,
        pluginName: '',
        deviceType: '',
        authenticated: false,
        manifest: null,
        lastHeartbeatAt: expect.any(Number),
      });

      jest.advanceTimersByTime(10_000);

      expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
        type: WS_TYPE.ERROR,
        action: WS_ACTION.AUTH_FAIL,
        payload: {
          error: '认证超时',
        },
      });
      expect(ws.close).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears auth timeout on close and logs websocket errors through the gateway logger', () => {
    jest.useFakeTimers();
    try {
      const ws = createSocketStub();
      const loggerError = jest.fn();
      (gateway as any).logger.error = loggerError;

      (gateway as any).handleConnection(ws);

      getSocketHandler(ws, 'error')(new Error('boom'));
      getSocketHandler(ws, 'close')();
      jest.advanceTimersByTime(10_000);

      expect(loggerError).toHaveBeenCalledWith('来自 "" 的 WS 错误：boom');
      expect((gateway as any).connections.has(ws)).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects malformed raw websocket payloads before gateway routing', async () => {
    const ws = createSocketStub();

    (gateway as any).handleConnection(ws);

    getSocketHandler(ws, 'message')(Buffer.from('{bad-json'));
    await flushPendingTasks();

    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'parse_error',
      payload: {
        error: '无效的 JSON',
      },
    });
    closeSocketConnection(ws);
  });

  it('rejects malformed websocket envelopes before they reach the gateway message router', async () => {
    const ws = createSocketStub();

    (gateway as any).handleConnection(ws);

    getSocketHandler(ws, 'message')(Buffer.from(JSON.stringify({ type: WS_TYPE.PLUGIN })));
    await flushPendingTasks();

    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: {
        error: '无效的插件协议消息',
      },
    });
    closeSocketConnection(ws);
  });

  it('returns protocol errors when downstream plugin message handling throws', async () => {
    const ws = createSocketStub();

    (gateway as any).handleConnection(ws);
    Object.assign((gateway as any).connections.get(ws), {
      authenticated: true,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });
    pluginRuntimeOrchestrator.registerPlugin.mockRejectedValueOnce(new Error('boom'));

    getSocketHandler(ws, 'message')(
      Buffer.from(JSON.stringify({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        },
      })),
    );
    await flushPendingTasks();

    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: {
        error: '插件协议消息处理失败',
      },
    });
    closeSocketConnection(ws);
  });

  it('rejects unauthenticated websocket plugin messages before routing', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        },
      },
    );

    expect(pluginRuntimeOrchestrator.registerPlugin).not.toHaveBeenCalled();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: WS_ACTION.AUTH_FAIL,
      payload: {
        error: '未认证',
      },
    });
  });

  it('rejects malformed auth payloads before authentication runs', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTHENTICATE,
        payload: null,
      },
    );

    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: {
        error: '无效的认证负载',
      },
    });
  });

  it('registers a remote plugin manifest into the unified runtime', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: null,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    expect(pluginRuntimeOrchestrator.registerPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: {
          ...remoteManifest,
          routes: [],
        },
        runtimeKind: 'remote',
        transport: expect.any(Object),
      }),
    );
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER_OK,
        payload: {},
      }),
    );
    expect(
      pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0].transport.listSupportedActions(),
    ).toEqual([
      'health-check',
      'reload',
      'reconnect',
    ]);
  });

  it('normalizes malformed manifest entries during remote plugin registration', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: null,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: {
            ...remoteManifest,
            permissions: [
              'conversation:read',
              42,
            ],
            tools: [
              remoteManifest.tools[0],
              {
                name: 9,
              },
            ],
            hooks: [
              {
                name: 'chat:before-model',
              },
              {
                name: 7,
              },
            ],
          },
        },
      },
    );

    expect(pluginRuntimeOrchestrator.registerPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: {
          id: 'remote.pc-host',
          name: '电脑助手',
          version: '1.0.0',
          runtime: 'remote',
          permissions: ['conversation:read'],
          tools: [
            remoteManifest.tools[0],
          ],
          hooks: [
            {
              name: 'chat:before-model',
            },
          ],
          routes: [],
        },
      }),
    );
  });

  it('throws when resolving a remote manifest without a manifest body', () => {
    expect(() =>
      resolvePluginGatewayManifest({
        pluginName: 'remote.pc-host',
        manifest: null,
      }),
    ).toThrow('插件注册负载缺少 manifest');
  });

  it('rejects malformed register payloads without throwing from the plugin message handler', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: null,
    };

    await expect(
      (gateway as any).handleMessage(
        ws,
        conn,
        {
          type: WS_TYPE.PLUGIN,
          action: WS_ACTION.REGISTER,
          payload: null,
        },
      ),
    ).resolves.toBeUndefined();

    expect(pluginRuntimeOrchestrator.registerPlugin).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: {
        error: '无效的插件注册负载',
      },
    });
  });

  it('handles host api calls from remote plugins and returns the result over websocket', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    const payload: HostCallPayload = {
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
    };
    (gateway as any).activeRequestContexts.set('runtime-request-1', {
      socket: ws,
      context: payload.context,
    });

    pluginRuntime.callHost.mockResolvedValue([
      {
        id: 'memory-1',
        content: '用户喜欢咖啡',
      },
    ]);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-1',
        payload,
      },
    );

    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
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

  it('rejects malformed host api payloads before they reach the runtime', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-bad-host',
        payload: {
          method: 'plugin.self.get',
          params: 'bad-params',
        },
      },
    );

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      requestId: 'request-bad-host',
      payload: {
        error: '无效的 Host API 调用负载',
      },
    });
  });

  it('rejects unknown host api method names before they reach the runtime', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    const approvedContext = {
      source: 'chat-tool',
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    (gateway as any).activeRequestContexts.set('runtime-request-invalid-method', {
      socket: ws,
      context: approvedContext,
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-invalid-method',
        payload: {
          method: 'host.not-real',
          context: approvedContext,
          params: {},
        },
      },
    );

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      requestId: 'request-invalid-method',
      payload: {
        error: '无效的 Host API 调用负载',
      },
    });
  });

  it('rejects remote host api calls that forge execution-scoped context', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-2',
        payload: {
          method: 'memory.search',
          context: {
            source: 'chat-tool',
            userId: 'user-9',
            conversationId: 'conversation-9',
          },
          params: {
            query: '越权读取',
          },
        } satisfies HostCallPayload,
      },
    );

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      requestId: 'request-2',
      payload: {
        error: 'Host API memory.search 缺少已授权的调用上下文',
      },
    });
  });

  it('allows connection-scoped host api calls without trusting plugin-supplied user context', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    pluginRuntime.callHost.mockResolvedValue({
      id: 'remote.pc-host',
      name: '电脑助手',
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-3',
        payload: {
          method: 'plugin.self.get',
          context: {
            source: 'chat-tool',
            userId: 'forged-user',
            conversationId: 'forged-conversation',
          },
          params: {},
        } satisfies HostCallPayload,
      },
    );

    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: {
        source: 'plugin',
      },
      method: 'plugin.self.get',
      params: {},
    });
  });

  it('refreshes persisted heartbeat timestamps when a remote plugin sends ping', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: 0,
    };
    pluginRuntimeOrchestrator.touchPluginHeartbeat.mockResolvedValue(undefined);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.HEARTBEAT,
        action: WS_ACTION.PING,
        payload: {},
      },
    );

    expect(pluginRuntimeOrchestrator.touchPluginHeartbeat).toHaveBeenCalledWith('remote.pc-host');
    expect(conn.lastHeartbeatAt).toBeGreaterThan(0);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: WS_TYPE.HEARTBEAT,
        action: WS_ACTION.PONG,
        payload: {},
      }),
    );
  });

  it('closes stale authenticated remote plugin connections during heartbeat sweeps', () => {
    const staleSocket = createSocketStub();
    const freshSocket = createSocketStub();
    const staleConnection = {
      ws: staleSocket,
      pluginName: 'remote.stale-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now() - 120_000,
    };
    const freshConnection = {
      ws: freshSocket,
      pluginName: 'remote.fresh-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now(),
    };

    (gateway as any).connections.set(staleSocket, staleConnection);
    (gateway as any).connections.set(freshSocket, freshConnection);

    (gateway as any).checkHeartbeats();

    expect(staleSocket.close).toHaveBeenCalled();
    expect(freshSocket.close).not.toHaveBeenCalled();
  });

  it('sends execute messages through the registered remote transport and resolves the response', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: {
        dirPath: 'C:\\\\',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });

    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
    expect(sentMessage).toEqual({
      type: WS_TYPE.COMMAND,
      action: WS_ACTION.EXECUTE,
      requestId: expect.any(String),
      payload: {
        toolName: 'list_directory',
        params: {
          dirPath: 'C:\\\\',
        },
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
      },
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          data: {
            entries: ['Users', 'Windows'],
          },
        },
      },
    );

    await expect(resultPromise).resolves.toEqual({
      entries: ['Users', 'Windows'],
    });
  });

  it('rejects pending execute requests when the remote plugin returns command errors', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: {
        dirPath: 'C:\\\\',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });
    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_ERROR,
        requestId: sentMessage.requestId,
        payload: {
          error: 'remote boom',
        },
      },
    );

    await expect(resultPromise).rejects.toThrow('remote boom');
  });

  it('sends hook messages through the registered remote transport and resolves the response', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    const context = {
      source: 'chat-hook',
      userId: 'user-1',
      conversationId: 'conversation-1',
      metadata: {
        timeoutMs: 1234,
      },
    } as const;

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context,
      payload: {
        message: 'hello',
      },
    });

    const sentMessage = readLastSentMessage(ws);
    expect(sentMessage).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_INVOKE,
      requestId: expect.any(String),
      payload: {
        hookName: 'chat:before-model',
        context,
        payload: {
          message: 'hello',
        },
      },
    });
    expect((gateway as any).activeRequestContexts.get(sentMessage.requestId)?.context).toEqual(context);
    expect((gateway as any).activeRequestContexts.get(sentMessage.requestId)?.context).not.toBe(context);
    expect((gateway as any).activeRequestContexts.get(sentMessage.requestId)?.context.metadata)
      .not.toBe(context.metadata);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOOK_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          data: {
            action: 'continue',
          },
        },
      },
    );

    await expect(resultPromise).resolves.toEqual({
      action: 'continue',
    });
  });

  it('rejects pending hook invocations when the remote plugin returns malformed hook results', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
      },
      payload: {
        message: 'hello',
      },
    });
    const sentMessage = readLastSentMessage(ws);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOOK_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          bad: true,
        },
      },
    );

    await expect(resultPromise).rejects.toThrow('无效的 Hook 返回负载');
  });

  it('rejects pending hook invocations when the remote plugin returns hook errors', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
      },
      payload: {
        message: 'hello',
      },
    });
    const sentMessage = readLastSentMessage(ws);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOOK_ERROR,
        requestId: sentMessage.requestId,
        payload: {
          error: 'hook boom',
        },
      },
    );

    await expect(resultPromise).rejects.toThrow('hook boom');
  });

  it('sends route messages through the registered remote transport and resolves the response', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: {
            ...remoteManifest,
            routes: [
              {
                path: 'inspect/context',
                methods: ['GET'],
              },
            ],
          },
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeRoute({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
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

    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
    expect(sentMessage).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.ROUTE_INVOKE,
      requestId: expect.any(String),
      payload: {
        request: {
          path: 'inspect/context',
          method: 'GET',
          headers: {},
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
      },
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          data: {
            status: 200,
            body: {
              ok: true,
            },
          },
        },
      },
    );

    await expect(resultPromise).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
      },
    });
  });

  it('disconnects a connected remote plugin to trigger reconnect', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);

    await expect(
      (gateway as any).disconnectPlugin('remote.pc-host'),
    ).resolves.toBeUndefined();

    expect(ws.close).toHaveBeenCalled();
  });

  it('replaces older authenticated connections with the same plugin name without unregistering the new one', async () => {
    const oldSocket = createSocketStub();
    const newSocket = createSocketStub();
    const oldConnection = {
      ws: oldSocket,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };
    const newConnection = {
      ws: newSocket,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };
    jwtService.verify.mockReturnValue({
      sub: 'plugin-token',
      role: 'admin',
    });

    await (gateway as any).handleAuth(oldSocket, oldConnection, {
      token: 'token-1',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });
    await (gateway as any).handleAuth(newSocket, newConnection, {
      token: 'token-2',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(oldSocket.close).toHaveBeenCalled();
    expect((gateway as any).connectionByPluginId.get('remote.pc-host')).toBe(newConnection);

    await (gateway as any).handleDisconnect(oldConnection);

    expect(pluginRuntimeOrchestrator.unregisterPlugin).not.toHaveBeenCalled();
    expect((gateway as any).connectionByPluginId.get('remote.pc-host')).toBe(newConnection);
  });

  it('authenticates remote bootstrap tokens when plugin identity matches the token claims', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };
    jwtService.verify.mockReturnValue({
      role: 'remote_plugin',
      authKind: 'remote-plugin',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'remote-bootstrap-token',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
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
    jwtService.verify.mockReturnValue({
      role: 'remote_plugin',
      authKind: 'remote-plugin',
      pluginName: 'remote.other-host',
      deviceType: 'pc',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'remote-bootstrap-token',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(conn.authenticated).toBe(false);
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTH_FAIL,
      payload: {
        error: '远程插件令牌与当前插件标识不匹配',
      },
    });
    expect(ws.close).toHaveBeenCalled();
  });

  it('rejects websocket authentication for non-admin tokens', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 0,
    };
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      role: 'user',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'token-user',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTH_FAIL,
        payload: {
          error: '只有管理员或专用远程插件令牌可以接入远程插件',
        },
      }),
    );
    expect(ws.close).toHaveBeenCalled();
    expect(conn.authenticated).toBe(false);
  });

  it('rejects pending remote requests immediately when the websocket disconnects', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now(),
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: {
        dirPath: 'C:\\\\',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });

    await (gateway as any).handleDisconnect(conn);

    await expect(resultPromise).rejects.toThrow('插件连接已断开');
    expect((gateway as any).pendingRequests.size).toBe(0);
    expect((gateway as any).activeRequestContexts.size).toBe(0);
  });

  it('warns and ignores command messages that do not include request ids', async () => {
    const ws = createSocketStub();
    const loggerWarn = jest.fn();
    (gateway as any).logger.warn = loggerWarn;

    await (gateway as any).handleMessage(
      ws,
      {
        ws,
        pluginName: 'remote.pc-host',
        deviceType: 'pc',
        authenticated: true,
        manifest: remoteManifest,
        lastHeartbeatAt: Date.now(),
      },
      {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_ERROR,
        payload: {
          error: 'ignored',
        },
      },
    );

    expect(loggerWarn).toHaveBeenCalledWith(
      '收到缺少 requestId 的插件消息: command/execute_error',
    );
  });

  it('performs a remote health check by pinging the websocket', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);

    const healthPromise = (gateway as any).checkPluginHealth('remote.pc-host', 5000);
    const pongHandler = ws.once.mock.calls.find((call) => call[0] === 'pong')?.[1];
    expect(typeof pongHandler).toBe('function');
    pongHandler();

    await expect(healthPromise).resolves.toEqual({
      ok: true,
    });
    expect(ws.ping).toHaveBeenCalled();
  });
});

/**
 * 创建最小 WebSocket 桩对象。
 * @returns 仅包含网关测试所需字段的方法桩
 */
function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    ping: jest.fn(),
  };
}

function getSocketHandler(ws: ReturnType<typeof createSocketStub>, eventName: string) {
  const handler = ws.on.mock.calls.find((call) => call[0] === eventName)?.[1];
  if (typeof handler !== 'function') {
    throw new Error(`missing socket handler for ${eventName}`);
  }

  return handler as (...args: unknown[]) => void;
}

function readLastSentMessage(ws: ReturnType<typeof createSocketStub>) {
  return JSON.parse(ws.send.mock.calls.at(-1)?.[0] ?? '{}');
}

async function flushPendingTasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

function closeSocketConnection(ws: ReturnType<typeof createSocketStub>) {
  getSocketHandler(ws, 'close')();
}
