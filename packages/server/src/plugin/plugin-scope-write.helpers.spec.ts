import { preparePluginScopeUpdate } from './plugin-scope-write.helpers';

describe('plugin-scope-write.helpers', () => {
  it('normalizes scope writes into persisted governance data', () => {
    expect(
      preparePluginScopeUpdate({
        plugin: {
          name: 'builtin.memory-context',
          runtimeKind: 'builtin',
        },
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': false,
          },
        },
      }),
    ).toEqual({
      normalizedScope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
      updateData: {
        defaultEnabled: true,
        conversationScopes: JSON.stringify({
          'conversation-1': false,
        }),
      },
    });
  });

  it('rejects protected builtin scope writes that try to disable the plugin', () => {
    expect(() =>
      preparePluginScopeUpdate({
        plugin: {
          name: 'builtin.core-tools',
          runtimeKind: 'builtin',
        },
        scope: {
          defaultEnabled: false,
          conversations: {},
        },
      }),
    ).toThrow('基础内建工具属于宿主必需插件，不能禁用。');
  });
});
