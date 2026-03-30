import type { PluginManifest } from '@garlic-claw/shared';
import { PluginCommandService } from './plugin-command.service';

describe('PluginCommandService', () => {
  const pluginService = {
    findAll: jest.fn(),
  };

  const pluginRuntime = {
    listPlugins: jest.fn(),
  };

  let service: PluginCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginCommandService(
      pluginService as never,
      pluginRuntime as never,
    );
  });

  it('builds a unified command directory from runtime manifests and persisted hook filters', async () => {
    const runtimeManifest: PluginManifest = {
      id: 'builtin.core-tools',
      name: '核心工具',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: [],
      tools: [],
      hooks: [
        {
          name: 'message:received',
          priority: -10,
          filter: {
            message: {
              commands: ['/sys reload', '/sr'],
            },
          },
        },
      ],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/sys reload',
          path: ['sys', 'reload'],
          aliases: ['/sr'],
          variants: ['/sys reload', '/sr'],
          description: '重载系统命令',
          priority: -1,
        },
      ],
    };

    pluginService.findAll.mockResolvedValue([
      {
        id: 'plugin-1',
        name: 'builtin.core-tools',
        displayName: '核心工具',
        runtimeKind: 'builtin',
        status: 'online',
        defaultEnabled: true,
        hooks: JSON.stringify(runtimeManifest.hooks ?? []),
      },
      {
        id: 'plugin-2',
        name: 'remote.ops-helper',
        displayName: '运维助手',
        runtimeKind: 'remote',
        status: 'offline',
        defaultEnabled: false,
        hooks: JSON.stringify([
          {
            name: 'message:received',
            priority: 5,
            filter: {
              message: {
                commands: ['/sys reload', '/ops status'],
              },
            },
          },
        ]),
      },
    ]);
    pluginRuntime.listPlugins.mockReturnValue([
      {
        pluginId: 'builtin.core-tools',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        manifest: runtimeManifest,
        supportedActions: ['health-check', 'reload'],
        runtimePressure: {
          activeExecutions: 0,
          maxConcurrentExecutions: 4,
        },
      },
    ]);

    const result = await service.listOverview();

    expect(result.commands).toEqual([
      expect.objectContaining({
        commandId: 'builtin.core-tools:/sys reload:command',
        pluginId: 'builtin.core-tools',
        pluginDisplayName: '核心工具',
        connected: true,
        runtimeKind: 'builtin',
        defaultEnabled: true,
        source: 'manifest',
        kind: 'command',
        canonicalCommand: '/sys reload',
        aliases: ['/sr'],
        variants: ['/sys reload', '/sr'],
        conflictTriggers: ['/sys reload'],
        governance: {
          canDisable: false,
          builtinRole: 'system-required',
          disableReason: expect.any(String),
        },
      }),
      expect.objectContaining({
        commandId: 'remote.ops-helper:/sys reload:hook-filter',
        pluginId: 'remote.ops-helper',
        pluginDisplayName: '运维助手',
        connected: false,
        runtimeKind: 'remote',
        defaultEnabled: false,
        source: 'hook-filter',
        kind: 'hook-filter',
        canonicalCommand: '/sys reload',
        aliases: ['/ops status'],
        variants: ['/sys reload', '/ops status'],
        conflictTriggers: ['/sys reload'],
        governance: {
          canDisable: true,
        },
      }),
    ]);
    expect(result.conflicts).toEqual([
      {
        trigger: '/sys reload',
        commands: [
          expect.objectContaining({
            commandId: 'builtin.core-tools:/sys reload:command',
            pluginId: 'builtin.core-tools',
            priority: -1,
          }),
          expect.objectContaining({
            commandId: 'remote.ops-helper:/sys reload:hook-filter',
            pluginId: 'remote.ops-helper',
            priority: 5,
          }),
        ],
      },
    ]);
  });
});
