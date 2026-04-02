import type { PluginActionName } from '@garlic-claw/shared';
import { HttpException } from '@nestjs/common';
import {
  buildRuntimePressureSnapshot,
  DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS,
  isPluginOverloadedError,
  listSupportedPluginActions,
  resolveMaxConcurrentExecutions,
  runWithRuntimeExecutionSlot,
} from './plugin-runtime-record.helpers';

describe('plugin-runtime-record.helpers', () => {
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
