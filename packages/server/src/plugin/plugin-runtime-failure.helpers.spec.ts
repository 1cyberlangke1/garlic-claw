import type { PluginManifest } from '@garlic-claw/shared';
import { recordRuntimePluginFailureAndDispatch } from './plugin-runtime-failure.helpers';

describe('plugin-runtime-failure.helpers', () => {
  const manifest: PluginManifest = {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: [],
    tools: [],
  };

  it('records plugin failures and dispatches plugin:error payloads', async () => {
    const recordFailure = jest.fn().mockResolvedValue(undefined);
    const dispatchPluginErrorHook = jest.fn().mockResolvedValue(undefined);

    await expect(
      recordRuntimePluginFailureAndDispatch({
        pluginId: 'plugin-a',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
        checked: true,
        record: {
          manifest,
          runtimeKind: 'builtin',
          deviceType: 'server',
        },
        recordFailure,
        dispatchPluginErrorHook,
      }),
    ).resolves.toBeUndefined();

    expect(recordFailure).toHaveBeenCalledWith({
      pluginId: 'plugin-a',
      type: 'tool:error',
      message: 'tool exploded',
      metadata: {
        toolName: 'echo',
      },
      checked: true,
    });
    expect(dispatchPluginErrorHook).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
      },
      plugin: {
        id: 'plugin-a',
        runtimeKind: 'builtin',
        deviceType: 'server',
        manifest,
      },
      error: {
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
      },
      occurredAt: expect.any(String),
    });
  });

  it('skips plugin:error dispatch when requested', async () => {
    const recordFailure = jest.fn().mockResolvedValue(undefined);
    const dispatchPluginErrorHook = jest.fn().mockResolvedValue(undefined);

    await expect(
      recordRuntimePluginFailureAndDispatch({
        pluginId: 'plugin-a',
        context: {
          source: 'plugin',
        },
        type: 'route:error',
        message: 'route exploded',
        skipPluginErrorHook: true,
        recordFailure,
        dispatchPluginErrorHook,
      }),
    ).resolves.toBeUndefined();

    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(dispatchPluginErrorHook).not.toHaveBeenCalled();
  });
});
