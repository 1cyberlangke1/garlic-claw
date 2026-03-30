import { PluginCommandController } from './plugin-command.controller';

describe('PluginCommandController', () => {
  const pluginCommands = {
    listOverview: jest.fn(),
  };

  let controller: PluginCommandController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginCommandController(pluginCommands as never);
  });

  it('returns the unified plugin command directory overview', async () => {
    pluginCommands.listOverview.mockResolvedValue({
      commands: [
        {
          commandId: 'builtin.core-tools:/sys reload:command',
          pluginId: 'builtin.core-tools',
          pluginDisplayName: '核心工具',
          connected: true,
          runtimeKind: 'builtin',
          defaultEnabled: true,
          source: 'manifest',
          kind: 'command',
          canonicalCommand: '/sys reload',
          path: ['sys', 'reload'],
          aliases: ['/sr'],
          variants: ['/sys reload', '/sr'],
          conflictTriggers: ['/sys reload'],
          governance: {
            canDisable: false,
            builtinRole: 'system-required',
            disableReason: '核心工具属于必要系统插件，不能禁用',
          },
        },
      ],
      conflicts: [
        {
          trigger: '/sys reload',
          commands: [
            {
              commandId: 'builtin.core-tools:/sys reload:command',
              pluginId: 'builtin.core-tools',
              pluginDisplayName: '核心工具',
              runtimeKind: 'builtin',
              connected: true,
              defaultEnabled: true,
              kind: 'command',
              canonicalCommand: '/sys reload',
              priority: -1,
            },
          ],
        },
      ],
    });

    await expect(controller.listOverview()).resolves.toEqual({
      commands: [
        expect.objectContaining({
          commandId: 'builtin.core-tools:/sys reload:command',
          canonicalCommand: '/sys reload',
        }),
      ],
      conflicts: [
        expect.objectContaining({
          trigger: '/sys reload',
        }),
      ],
    });
  });
});
