import type { PluginManifest } from '@garlic-claw/shared';
import {
  buildPluginGovernanceSnapshot,
  readPersistedPluginManifestRecord,
} from './plugin-governance.helpers';
import { serializePersistedPluginManifest } from './plugin-manifest.persistence';

describe('plugin-governance.helpers', () => {
  const manifest: PluginManifest = {
    id: 'builtin.memory-context',
    name: '记忆上下文',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read'],
    tools: [],
    hooks: [],
    routes: [],
    config: {
      fields: [
        {
          key: 'limit',
          type: 'number',
          required: true,
          defaultValue: 5,
          description: '检索数量',
        },
      ],
    },
  };

  it('reads persisted manifests and builds governance snapshots', () => {
    const plugin = {
      name: 'builtin.memory-context',
      displayName: '记忆上下文',
      description: null,
      version: '1.0.0',
      runtimeKind: 'builtin',
      manifestJson: serializePersistedPluginManifest(manifest),
      config: JSON.stringify({
        limit: 9,
      }),
      defaultEnabled: true,
      conversationScopes: JSON.stringify({
        'conversation-1': false,
      }),
    };

    expect(
      readPersistedPluginManifestRecord({
        plugin,
      }),
    ).toEqual(manifest);
    expect(
      buildPluginGovernanceSnapshot({
        plugin,
      }),
    ).toEqual({
      configSchema: manifest.config,
      resolvedConfig: {
        limit: 9,
      },
      scope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
    });
  });

  it('falls back safely when persisted manifest json is malformed', () => {
    const onWarn = jest.fn();

    expect(
      buildPluginGovernanceSnapshot({
        plugin: {
          name: 'builtin.memory-context',
          displayName: '记忆上下文',
          description: null,
          version: '1.0.0',
          runtimeKind: 'builtin',
          manifestJson: '{bad-json',
          config: '{bad-json',
          defaultEnabled: true,
          conversationScopes: '{bad-json',
        },
        onWarn,
      }),
    ).toEqual({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {},
      },
    });
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('plugin.manifestJson JSON 无效，已回退默认值:'),
    );
  });
});
