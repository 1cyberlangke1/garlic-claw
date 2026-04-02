import { WebSocket } from 'ws';
import type { PluginCallContext } from '@garlic-claw/shared';
import {
  clonePluginGatewayCallContext,
  findApprovedPluginGatewayRequestContext,
  resolvePluginGatewayHostCallContext,
  resolvePluginGatewayManifest,
  sameAuthorizedPluginGatewayContext,
} from './plugin-gateway-context.helpers';

describe('plugin-gateway-context.helpers', () => {
  it('normalizes remote manifests and rejects missing manifest payloads', () => {
    expect(
      resolvePluginGatewayManifest({
        pluginName: 'remote.pc-host',
        manifest: {
          id: 'remote.pc-host',
          name: '电脑助手',
          version: '1.0.0',
          runtime: 'remote',
          permissions: ['conversation:read', 42],
          tools: [],
          hooks: [],
          routes: [],
        },
      }),
    ).toEqual({
      id: 'remote.pc-host',
      name: '电脑助手',
      version: '1.0.0',
      runtime: 'remote',
      permissions: ['conversation:read'],
      tools: [],
      hooks: [],
      routes: [],
    });

    expect(() =>
      resolvePluginGatewayManifest({
        pluginName: 'remote.pc-host',
        manifest: null,
      }),
    ).toThrow('插件注册负载缺少 manifest');
  });

  it('resolves approved host call contexts and falls back for connection-scoped methods', () => {
    const ws = createSocketStub();
    const approvedContext: PluginCallContext = {
      source: 'chat-tool',
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws,
          context: approvedContext,
        },
      ],
    ]);

    expect(
      findApprovedPluginGatewayRequestContext({
        ws,
        context: approvedContext,
        activeRequestContexts,
        isSameContext: sameAuthorizedPluginGatewayContext,
        cloneContext: clonePluginGatewayCallContext,
      }),
    ).toEqual(approvedContext);

    expect(
      resolvePluginGatewayHostCallContext({
        ws,
        method: 'plugin.self.get',
        context: {
          source: 'chat-tool',
          userId: 'forged-user',
          conversationId: 'forged-conversation',
        },
        activeRequestContexts,
        isConnectionScopedHostMethod: (method) => method === 'plugin.self.get',
        isSameContext: sameAuthorizedPluginGatewayContext,
        cloneContext: clonePluginGatewayCallContext,
      }),
    ).toEqual({
      source: 'plugin',
    });

    expect(() =>
      resolvePluginGatewayHostCallContext({
        ws,
        method: 'memory.search',
        context: {
          source: 'chat-tool',
          userId: 'forged-user',
          conversationId: 'forged-conversation',
        },
        activeRequestContexts,
        isConnectionScopedHostMethod: () => false,
        isSameContext: sameAuthorizedPluginGatewayContext,
        cloneContext: clonePluginGatewayCallContext,
      }),
    ).toThrow('Host API memory.search 缺少已授权的调用上下文');
  });

  it('clones context metadata without sharing mutable objects', () => {
    const original = {
      source: 'plugin',
      metadata: {
        timeoutMs: 1234,
      },
    } as const;

    const cloned = clonePluginGatewayCallContext(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.metadata).not.toBe(original.metadata);
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;
}
