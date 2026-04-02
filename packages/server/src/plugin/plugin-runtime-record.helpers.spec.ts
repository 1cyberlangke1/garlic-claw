import type { PluginActionName } from '@garlic-claw/shared';
import { HttpException } from '@nestjs/common';
import {
  buildPluginRuntimeRecord,
  buildRuntimePressureSnapshot,
  collectConversationSessionIdsOwnedByPlugin,
  DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS,
  isPluginOverloadedError,
  listSupportedPluginActions,
  refreshPluginRuntimeRecordGovernance,
  resolveMaxConcurrentExecutions,
  runWithRuntimeExecutionSlot,
} from './plugin-runtime-record.helpers';

describe('plugin-runtime-record.helpers', () => {
  const transport = {
    executeTool: jest.fn(),
    invokeHook: jest.fn(),
    invokeRoute: jest.fn(),
  };

  it('normalizes max concurrent executions from governance config', () => {
    expect(
      resolveMaxConcurrentExecutions({
        resolvedConfig: {
          maxConcurrentExecutions: 9.8,
        },
      }),
    ).toBe(9);
    expect(
      resolveMaxConcurrentExecutions({
        resolvedConfig: {
          maxConcurrentExecutions: 0,
        },
      }),
    ).toBe(1);
    expect(
      resolveMaxConcurrentExecutions({
        resolvedConfig: {
          maxConcurrentExecutions: 99,
        },
      }),
    ).toBe(32);
    expect(
      resolveMaxConcurrentExecutions({
        resolvedConfig: {},
      }),
    ).toBe(DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS);
  });

  it('builds runtime pressure snapshots', () => {
    expect(
      buildRuntimePressureSnapshot({
        activeExecutions: 2,
        maxConcurrentExecutions: 6,
      }),
    ).toEqual({
      activeExecutions: 2,
      maxConcurrentExecutions: 6,
    });
  });

  it('builds runtime records with default governance and normalized concurrency', () => {
    expect(
      buildPluginRuntimeRecord({
        manifest: {
          id: 'plugin-a',
          name: 'Plugin A',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: [],
          tools: [],
          hooks: [],
          routes: [],
        },
        runtimeKind: 'builtin',
        transport,
      }),
    ).toEqual({
      manifest: {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: [],
        tools: [],
        hooks: [],
        routes: [],
      },
      runtimeKind: 'builtin',
      deviceType: 'builtin',
      transport,
      governance: {
        configSchema: null,
        resolvedConfig: {},
        scope: {
          defaultEnabled: true,
          conversations: {},
        },
      },
      activeExecutions: 0,
      maxConcurrentExecutions: DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS,
    });
  });

  it('normalizes supported plugin actions', () => {
    const supported = listSupportedPluginActions({
      transport: {
        listSupportedActions: () => [
          'reload',
          'health-check',
          'reload',
          'reconnect',
          'unknown' as PluginActionName,
        ],
      },
    });

    expect(supported).toEqual([
      'health-check',
      'reload',
      'reconnect',
    ]);
    expect(listSupportedPluginActions({ transport: {} })).toEqual(['health-check']);
  });

  it('refreshes runtime governance and collects disabled conversation sessions', () => {
    const record = buildPluginRuntimeRecord({
      manifest: {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: [],
        tools: [],
        hooks: [],
        routes: [],
      },
      runtimeKind: 'builtin',
      transport,
      governance: {
        configSchema: null,
        resolvedConfig: {
          maxConcurrentExecutions: 4,
        },
        scope: {
          defaultEnabled: true,
          conversations: {},
        },
      },
    });

    expect(
      refreshPluginRuntimeRecordGovernance({
        record,
        governance: {
          configSchema: null,
          resolvedConfig: {
            maxConcurrentExecutions: 2,
          },
          scope: {
            defaultEnabled: true,
            conversations: {
              'conversation-1': false,
            },
          },
        },
        conversationSessions: [
          {
            pluginId: 'plugin-a',
            conversationId: 'conversation-1',
            startedAt: 1,
            expiresAt: 100,
            lastMatchedAt: null,
            captureHistory: false,
            historyMessages: [],
          },
          {
            pluginId: 'plugin-b',
            conversationId: 'conversation-2',
            startedAt: 1,
            expiresAt: 100,
            lastMatchedAt: null,
            captureHistory: false,
            historyMessages: [],
          },
        ],
      }),
    ).toEqual(['conversation-1']);
    expect(record.maxConcurrentExecutions).toBe(2);
  });

  it('collects owned conversation session ids for unregister cleanup', () => {
    expect(
      collectConversationSessionIdsOwnedByPlugin(
        [
          {
            pluginId: 'plugin-a',
            conversationId: 'conversation-1',
            startedAt: 1,
            expiresAt: 100,
            lastMatchedAt: null,
            captureHistory: false,
            historyMessages: [],
          },
          {
            pluginId: 'plugin-b',
            conversationId: 'conversation-2',
            startedAt: 1,
            expiresAt: 100,
            lastMatchedAt: null,
            captureHistory: false,
            historyMessages: [],
          },
          {
            pluginId: 'plugin-a',
            conversationId: 'conversation-3',
            startedAt: 1,
            expiresAt: 100,
            lastMatchedAt: null,
            captureHistory: false,
            historyMessages: [],
          },
        ],
        'plugin-a',
      ),
    ).toEqual([
      'conversation-1',
      'conversation-3',
    ]);
  });

  it('runs execution within a managed runtime slot and releases it afterwards', async () => {
    const record = {
      manifest: {
        id: 'plugin-a',
      },
      activeExecutions: 0,
      maxConcurrentExecutions: 2,
    };
    const recordPluginEvent = jest.fn().mockResolvedValue(undefined);

    await expect(
      runWithRuntimeExecutionSlot({
        record,
        type: 'tool',
        metadata: {
          toolName: 'echo',
        },
        recordPluginEvent,
        execute: async () => {
          expect(record.activeExecutions).toBe(1);
          return 'ok';
        },
      }),
    ).resolves.toBe('ok');

    expect(record.activeExecutions).toBe(0);
    expect(recordPluginEvent).not.toHaveBeenCalled();
  });

  it('records overload warnings and throws a 429 rejection when runtime slots are exhausted', async () => {
    const record = {
      manifest: {
        id: 'plugin-a',
      },
      activeExecutions: 2,
      maxConcurrentExecutions: 2,
    };
    const recordPluginEvent = jest.fn().mockResolvedValue(undefined);

    await expect(
      runWithRuntimeExecutionSlot({
        record,
        type: 'hook',
        metadata: {
          hookName: 'message:received',
        },
        recordPluginEvent,
        execute: async () => 'unreachable',
      }),
    ).rejects.toThrow('插件 plugin-a 当前执行并发已达上限，请稍后重试');

    expect(recordPluginEvent).toHaveBeenCalledWith('plugin-a', {
      type: 'hook:overloaded',
      level: 'warn',
      message: '插件 plugin-a 当前执行并发已达上限，请稍后重试',
      metadata: {
        hookName: 'message:received',
        activeExecutions: 2,
        maxConcurrentExecutions: 2,
      },
    });
    expect(record.activeExecutions).toBe(2);
  });

  it('detects runtime overload exceptions', () => {
    expect(
      isPluginOverloadedError(new HttpException('too many', 429)),
    ).toBe(true);
    expect(
      isPluginOverloadedError(new HttpException('nope', 400)),
    ).toBe(false);
    expect(isPluginOverloadedError(new Error('plain error'))).toBe(false);
  });
});
