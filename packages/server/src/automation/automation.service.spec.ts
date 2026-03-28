import { AutomationService } from './automation.service';

describe('AutomationService', () => {
  const prisma = {
    automation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    automationLog: {
      create: jest.fn(),
    },
  };

  const pluginRuntime = {
    executeTool: jest.fn(),
    runAutomationBeforeRunHooks: jest.fn(),
    runAutomationAfterRunHooks: jest.fn(),
  };

  let service: AutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runAutomationBeforeRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => ({
        action: 'continue',
        payload,
      }),
    );
    pluginRuntime.runAutomationAfterRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    service = new AutomationService(
      prisma as never,
      pluginRuntime as never,
    );
  });

  it('routes device_command actions through the unified plugin runtime', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '记忆工具自动化',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '自动化保存的记忆',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-27T10:00:00.000Z'),
      updatedAt: new Date('2026-03-27T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.executeTool.mockResolvedValue({
      saved: true,
      id: 'memory-1',
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);

    const result = await service.executeAutomation('automation-1');

    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '自动化保存的记忆',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });
    expect(result).toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          result: {
            saved: true,
            id: 'memory-1',
          },
        },
      ],
    });
  });

  it('applies automation:before-run mutations before executing actions', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '自动化前置改写',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '原始内容',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.runAutomationBeforeRunHooks.mockResolvedValue({
      action: 'continue',
      payload: {
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
        automation: {
          id: 'automation-1',
          name: '自动化前置改写',
          trigger: { type: 'manual' },
          actions: [
            {
              type: 'device_command',
              plugin: 'builtin.memory-tools',
              capability: 'save_memory',
              params: {
                content: '原始内容',
              },
            },
          ],
          enabled: true,
          lastRunAt: null,
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '插件改写后的内容',
            },
          },
        ],
      },
    });
    pluginRuntime.executeTool.mockResolvedValue({
      saved: true,
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);
    pluginRuntime.runAutomationAfterRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );

    await service.executeAutomation('automation-1');

    expect(pluginRuntime.runAutomationBeforeRunHooks).toHaveBeenCalledWith({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      payload: {
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
        automation: {
          id: 'automation-1',
          name: '自动化前置改写',
          trigger: { type: 'manual' },
          actions: [
            {
              type: 'device_command',
              plugin: 'builtin.memory-tools',
              capability: 'save_memory',
              params: {
                content: '原始内容',
              },
            },
          ],
          enabled: true,
          lastRunAt: null,
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '原始内容',
            },
          },
        ],
      },
    });
    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '插件改写后的内容',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });
  });

  it('supports automation:before-run short-circuit and skips action execution', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '自动化短路',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '原始内容',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.runAutomationBeforeRunHooks.mockResolvedValue({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);
    pluginRuntime.runAutomationAfterRunHooks.mockResolvedValue({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      automation: {
        id: 'automation-1',
        name: '自动化短路',
        trigger: { type: 'manual' },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '原始内容',
            },
          },
        ],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });

    const result = await service.executeAutomation('automation-1');

    expect(pluginRuntime.executeTool).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });
  });
});
