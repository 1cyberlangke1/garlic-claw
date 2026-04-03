import {
  runMutatingHookChain,
  runShortCircuitingHookChain,
} from './plugin-runtime-hook-runner.helpers';

describe('plugin-runtime-hook-runner.helpers', () => {
  it('runs mutating hook chains sequentially and continues after failures', async () => {
    const invokeHook = jest.fn()
      .mockImplementationOnce(async ({ payload }) => ({
        action: 'mutate',
        value: Number((payload as { value: number }).value) + 2,
      }))
      .mockImplementationOnce(async () => {
        throw new Error('boom');
      })
      .mockImplementationOnce(async ({ payload }) => ({
        action: 'mutate',
        value: Number((payload as { value: number }).value) + 1,
      }));

    await expect(
      runMutatingHookChain({
        records: [
          { manifest: { id: 'plugin-a' } },
          { manifest: { id: 'plugin-b' } },
          { manifest: { id: 'plugin-c' } },
        ],
        hookName: 'message:created',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          value: 1,
        },
        invokeHook,
        normalizeResult: (raw) => raw as { action: 'pass' } | { action: 'mutate'; value: number },
        applyMutation: (_, result) => ({
          value: result.value,
        }),
      }),
    ).resolves.toEqual({
      value: 4,
    });

    expect(invokeHook).toHaveBeenNthCalledWith(1, {
      pluginId: 'plugin-a',
      hookName: 'message:created',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        value: 1,
      },
    });
    expect(invokeHook).toHaveBeenNthCalledWith(3, {
      pluginId: 'plugin-c',
      hookName: 'message:created',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        value: 3,
      },
    });
  });

  it('skips pass and null normalize results', async () => {
    await expect(
      runMutatingHookChain({
        records: [
          { manifest: { id: 'plugin-a' } },
          { manifest: { id: 'plugin-b' } },
        ],
        hookName: 'message:updated',
        context: {
          source: 'plugin',
        },
        payload: {
          value: 1,
        },
        invokeHook: jest.fn()
          .mockResolvedValueOnce({ action: 'pass' })
          .mockResolvedValueOnce({ ignored: true }),
        normalizeResult: (raw) => {
          if (!raw || typeof raw !== 'object' || !('action' in raw)) {
            return null;
          }
          return raw as { action: 'pass' } | { action: 'mutate'; value: number };
        },
        applyMutation: (_, result) => ({
          value: result.value,
        }),
      }),
    ).resolves.toEqual({
      value: 1,
    });
  });

  it('returns the first short-circuit result after applying prior mutations', async () => {
    const invokeHook = jest.fn()
      .mockResolvedValueOnce({
        action: 'mutate',
        value: 2,
      })
      .mockResolvedValueOnce({
        action: 'short-circuit',
        reason: 'done',
      });

    await expect(
      runShortCircuitingHookChain({
        records: [
          { manifest: { id: 'plugin-a' } },
          { manifest: { id: 'plugin-b' } },
        ],
        hookName: 'tool:before-call',
        context: {
          source: 'plugin',
        },
        payload: {
          value: 1,
        },
        invokeHook,
        normalizeResult: (raw) => raw as
          | { action: 'pass' }
          | { action: 'mutate'; value: number }
          | { action: 'short-circuit'; reason: string },
        applyMutation: (_, result) => ({
          value: result.value,
        }),
        buildShortCircuitReturn: async ({ payload, result }) => ({
          action: 'short-circuit' as const,
          value: payload.value,
          reason: result.reason,
        }),
      }),
    ).resolves.toEqual({
      action: 'short-circuit',
      value: 2,
      reason: 'done',
    });

    expect(invokeHook).toHaveBeenNthCalledWith(2, {
      pluginId: 'plugin-b',
      hookName: 'tool:before-call',
      context: {
        source: 'plugin',
      },
      payload: {
        value: 2,
      },
    });
  });
});
