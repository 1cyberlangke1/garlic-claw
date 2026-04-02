import type {
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import { preparePluginConfigUpdate } from './plugin-config-write.helpers';

describe('plugin-config-write.helpers', () => {
  const configSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        required: true,
        defaultValue: 5,
      },
      {
        key: 'promptPrefix',
        type: 'string',
        defaultValue: '与此用户相关的记忆',
      },
    ],
  };

  it('validates, persists, and resolves plugin config updates against manifest defaults', () => {
    const manifest: PluginManifest = {
      id: 'builtin.memory-context',
      name: '记忆上下文',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['config:read'],
      config: configSchema,
      tools: [],
      hooks: [],
      routes: [],
    };

    expect(
      preparePluginConfigUpdate({
        name: 'builtin.memory-context',
        plugin: createPluginRecord({
          manifestJson: JSON.stringify(manifest),
        }),
        values: {
          limit: 8,
        },
      }),
    ).toEqual({
      persistedConfigJson: JSON.stringify({
        limit: 8,
      }),
      snapshot: {
        schema: configSchema,
        values: {
          limit: 8,
          promptPrefix: '与此用户相关的记忆',
        },
      },
    });
  });

  it('rejects config writes when the plugin has no declared config schema', () => {
    const manifest: PluginManifest = {
      id: 'builtin.memory-context',
      name: '记忆上下文',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['config:read'],
      tools: [],
      hooks: [],
      routes: [],
    };

    expect(() =>
      preparePluginConfigUpdate({
        name: 'builtin.memory-context',
        plugin: createPluginRecord({
          manifestJson: JSON.stringify(manifest),
        }),
        values: {},
      }),
    ).toThrow('插件 builtin.memory-context 未声明配置 schema');
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
