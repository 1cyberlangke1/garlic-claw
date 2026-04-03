import type {
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import {
  buildPluginConfigSnapshot,
  buildPluginSelfInfo,
  buildResolvedPluginConfig,
} from './plugin-record-view.helpers';

describe('plugin-record-view.helpers', () => {
  it('builds config snapshot and resolved config from persisted manifest defaults', () => {
    const configSchema: PluginConfigSchema = {
      fields: [
        {
          key: 'threshold',
          type: 'number',
          required: false,
          defaultValue: 3,
        },
        {
          key: 'enabled',
          type: 'boolean',
          required: false,
          defaultValue: true,
        },
      ],
    };
    const manifest: PluginManifest = {
      id: 'builtin.memory-context',
      name: 'Memory Context',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['conversation:read'],
      config: configSchema,
      tools: [],
      hooks: [],
      routes: [],
    };
    const plugin = createPluginRecord({
      manifestJson: JSON.stringify(manifest),
      config: JSON.stringify({
        enabled: false,
      }),
    });

    expect(
      buildPluginConfigSnapshot({
        plugin,
      }),
    ).toEqual({
      schema: configSchema,
      values: {
        threshold: 3,
        enabled: false,
      },
    });
    expect(
      buildResolvedPluginConfig({
        plugin,
      }),
    ).toEqual({
      threshold: 3,
      enabled: false,
    });
  });

  it('builds self info from the persisted manifest contract', () => {
    const manifest: PluginManifest = {
      id: 'remote.pc-host',
      name: '电脑助手',
      version: '2.0.0',
      runtime: 'remote',
      description: '帮助操作电脑的远程插件',
      permissions: ['conversation:read'],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/pc',
          path: ['pc'],
          aliases: [],
          variants: [],
          description: '管理电脑助手',
        },
      ],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
      routes: [
        {
          path: '/health',
          methods: ['GET'],
        },
      ],
      tools: [],
    };

    expect(
      buildPluginSelfInfo({
        plugin: createPluginRecord({
          name: 'remote.pc-host',
          runtimeKind: 'remote',
          manifestJson: JSON.stringify(manifest),
        }),
      }),
    ).toEqual({
      id: 'remote.pc-host',
      name: '电脑助手',
      runtimeKind: 'remote',
      version: '2.0.0',
      description: '帮助操作电脑的远程插件',
      permissions: ['conversation:read'],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/pc',
          path: ['pc'],
          aliases: [],
          variants: [],
          description: '管理电脑助手',
        },
      ],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
      routes: [
        {
          path: '/health',
          methods: ['GET'],
        },
      ],
    });
  });
});

function createPluginRecord(
  overrides: Partial<{
    name: string;
    displayName: string | null;
    description: string | null;
    version: string | null;
    runtimeKind: string | null;
    manifestJson: string | null;
    config: string | null;
    defaultEnabled: boolean;
    conversationScopes: string | null;
  }> = {},
) {
  return {
    name: 'builtin.memory-context',
    displayName: 'Memory Context',
    description: null,
    version: '1.0.0',
    runtimeKind: 'builtin',
    manifestJson: null,
    config: null,
    defaultEnabled: true,
    conversationScopes: null,
    ...overrides,
  };
}
