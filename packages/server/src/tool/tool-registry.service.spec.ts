import { ModuleRef } from '@nestjs/core';
import type { PluginCallContext } from '@garlic-claw/shared';
import { ToolRegistryService } from './tool-registry.service';
import type { ToolProvider, ToolProviderTool } from './tool.types';

describe('ToolRegistryService', () => {
  const context: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
    activeProviderId: 'openai',
    activeModelId: 'gpt-5.2',
    activePersonaId: 'builtin.default-assistant',
  };

  function createProvider(
    kind: ToolProvider['kind'],
    tools: ToolProviderTool[],
    executeTool = jest.fn(),
  ): ToolProvider {
    return {
      kind,
      listSources: jest.fn().mockResolvedValue(
        [...new Map(
          tools.map((tool) => [
            `${tool.source.kind}:${tool.source.id}`,
            tool.source,
          ]),
        ).values()],
      ),
      listTools: jest.fn().mockResolvedValue(tools),
      executeTool,
    };
  }

  function createCollectStateProvider(
    kind: ToolProvider['kind'],
    tools: ToolProviderTool[],
    executeTool = jest.fn(),
  ): ToolProvider & {
    collectState: jest.Mock;
  } {
    const sources = [...new Map(
      tools.map((tool) => [
        `${tool.source.kind}:${tool.source.id}`,
        tool.source,
      ]),
    ).values()];

    return {
      kind,
      collectState: jest.fn().mockResolvedValue({
        sources,
        tools,
      }),
      listSources: jest.fn().mockResolvedValue(sources),
      listTools: jest.fn().mockResolvedValue(tools),
      executeTool,
    };
  }

  function createStatefulSettings(options?: {
    sourceOverrides?: Record<string, boolean>;
    toolOverrides?: Record<string, boolean>;
  }) {
    const sourceOverrides = new Map(Object.entries(options?.sourceOverrides ?? {}));
    const toolOverrides = new Map(Object.entries(options?.toolOverrides ?? {}));

    return {
      getSourceEnabled: jest.fn((kind: string, id: string) =>
        sourceOverrides.get(`${kind}:${id}`)),
      getToolEnabled: jest.fn((toolId: string) => toolOverrides.get(toolId)),
      setSourceEnabled: jest.fn((kind: string, id: string, enabled: boolean) => {
        sourceOverrides.set(`${kind}:${id}`, enabled);
      }),
      setToolEnabled: jest.fn((toolId: string, enabled: boolean) => {
        toolOverrides.set(toolId, enabled);
      }),
    };
  }

  function createPluginRuntime() {
    const runToolBeforeCallHooks = jest.fn().mockImplementation(async (input) => ({
      action: 'continue',
      payload: input.payload,
    }));
    const runToolAfterCallHooks = jest.fn().mockImplementation(async (input) => input.payload);

    return {
      runToolBeforeCallHooks,
      runToolAfterCallHooks,
      runHook: jest.fn(async ({ hookName, ...input }) =>
        hookName === 'tool:before-call'
          ? runToolBeforeCallHooks(input)
          : runToolAfterCallHooks(input)),
    };
  }

  function createRegistryService(options: {
    settings: {
      getSourceEnabled: jest.Mock;
      getToolEnabled: jest.Mock;
      setSourceEnabled?: jest.Mock;
      setToolEnabled?: jest.Mock;
    };
    pluginRuntime?: ReturnType<typeof createPluginRuntime>;
    pluginProvider?: ToolProvider;
    mcpProvider?: ToolProvider;
    skillProvider?: ToolProvider;
    mcpService?: {
      setServerEnabled?: jest.Mock;
    } | null;
    pluginService?: {
      getPluginScope: jest.Mock;
      updatePluginScope: jest.Mock;
    } | null;
  }) {
    const moduleRef = {
      get: jest.fn((token: { name?: string }) => {
        if (token?.name === 'PluginRuntimeService') {
          return options.pluginRuntime ?? null;
        }
        if (token?.name === 'PluginService') {
          return options.pluginService ?? null;
        }
        if (token?.name === 'McpService') {
          return options.mcpService ?? null;
        }

        return null;
      }),
    };

    return new ToolRegistryService(
      options.settings as never,
      (options.pluginProvider ?? createProvider('plugin', [])) as never,
      (options.mcpProvider ?? createProvider('mcp', [])) as never,
      options.skillProvider as never,
      moduleRef as unknown as ModuleRef,
    );
  }

  it('merges plugin and mcp tools into unified summaries with stable ids and call names', async () => {
    const pluginProvider = createProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        source: {
          kind: 'plugin',
          id: 'remote.pc-host',
          label: '电脑助手',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:01:00.000Z',
        },
        name: 'take_screenshot',
        description: '截图',
        parameters: {},
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
    ]);
    const mcpProvider = createProvider('mcp', [
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:02:00.000Z',
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
      },
    ]);
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      },
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider,
    });

    await expect(
      service.listAvailableToolSummaries({
        context,
      }),
    ).resolves.toEqual([
      {
        name: 'save_memory',
        callName: 'save_memory',
        toolId: 'plugin:builtin.memory-tools:save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        name: 'remote.pc-host__take_screenshot',
        callName: 'remote.pc-host__take_screenshot',
        toolId: 'plugin:remote.pc-host:take_screenshot',
        description: '[插件：remote.pc-host] 截图',
        parameters: {},
        sourceKind: 'plugin',
        sourceId: 'remote.pc-host',
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
      {
        name: 'mcp__weather__get_forecast',
        callName: 'mcp__weather__get_forecast',
        toolId: 'mcp:weather:get_forecast',
        description: '[MCP：weather] 获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'mcp',
        sourceId: 'weather',
      },
    ]);
  });

  it('projects generic skill package tools with stable call names', async () => {
    const skillProvider = createProvider('skill', [
      {
        source: {
          kind: 'skill',
          id: 'active-packages',
          label: 'Active Skill Packages',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-31T10:00:00.000Z',
        },
        name: 'asset.list',
        description: '列出当前会话 skill package 资产',
        parameters: {},
      },
      {
        source: {
          kind: 'skill',
          id: 'active-packages',
          label: 'Active Skill Packages',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-31T10:00:00.000Z',
        },
        name: 'script.run',
        description: '执行当前会话 skill package 脚本',
        parameters: {
          skillId: {
            type: 'string',
            required: true,
          },
        },
      },
    ]);
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      },
      pluginRuntime: createPluginRuntime(),
      skillProvider,
    });

    await expect(
      service.listAvailableToolSummaries({
        context,
      }),
    ).resolves.toEqual([
      {
        name: 'skill__asset__list',
        callName: 'skill__asset__list',
        toolId: 'skill:active-packages:asset.list',
        description: '[Skill] 列出当前会话 skill package 资产',
        parameters: {},
        sourceKind: 'skill',
        sourceId: 'active-packages',
      },
      {
        name: 'skill__script__run',
        callName: 'skill__script__run',
        toolId: 'skill:active-packages:script.run',
        description: '[Skill] 执行当前会话 skill package 脚本',
        parameters: {
          skillId: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'skill',
        sourceId: 'active-packages',
      },
    ]);
  });

  it('builds filtered AI tool sets and executes through the owning provider', async () => {
    const pluginExecuteTool = jest.fn()
      .mockResolvedValueOnce({
        count: 1,
      });
    const mcpExecuteTool = jest.fn()
      .mockResolvedValueOnce({
        weather: 'sunny',
      });
    const pluginProvider = createProvider(
      'plugin',
      [
        {
          source: {
            kind: 'plugin',
            id: 'builtin.subagent-delegate',
            label: '子代理委派',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:00:00.000Z',
          },
          name: 'delegate_work',
          description: '委派工作',
          parameters: {},
          pluginId: 'builtin.subagent-delegate',
          runtimeKind: 'builtin',
        },
        {
          source: {
            kind: 'plugin',
            id: 'builtin.memory-tools',
            label: '记忆工具',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:01:00.000Z',
          },
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
        },
      ],
      pluginExecuteTool,
    );
    const mcpProvider = createProvider(
      'mcp',
      [
        {
          source: {
            kind: 'mcp',
            id: 'weather',
            label: 'weather',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:02:00.000Z',
          },
          name: 'get_forecast',
          description: '获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      mcpExecuteTool,
    );
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      },
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider,
    });

    const toolSet = await service.buildToolSet({
      context,
      allowedToolNames: ['recall_memory', 'mcp__weather__get_forecast'],
      excludedSources: [
        {
          kind: 'plugin',
          id: 'builtin.subagent-delegate',
        },
      ],
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual([
      'recall_memory',
      'mcp__weather__get_forecast',
    ]);
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await executableToolSet.recall_memory.execute({
      query: '咖啡',
    });
    await executableToolSet.mcp__weather__get_forecast.execute({
      city: 'Shanghai',
    });

    expect(pluginExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'recall_memory',
        pluginId: 'builtin.memory-tools',
      }),
      params: {
        query: '咖啡',
      },
      context,
      skipLifecycleHooks: true,
    });
    expect(mcpExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'get_forecast',
        source: expect.objectContaining({
          kind: 'mcp',
          id: 'weather',
        }),
      }),
      params: {
        city: 'Shanghai',
      },
      context,
      skipLifecycleHooks: false,
    });
  });

  it('reuses one prepared tool selection to expose summaries and build a later tool set with a new execution context', async () => {
    const pluginExecuteTool = jest.fn().mockResolvedValue({
      saved: true,
    });
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      },
      pluginRuntime: createPluginRuntime(),
      pluginProvider: createProvider(
        'plugin',
        [
          {
            source: {
              kind: 'plugin',
              id: 'builtin.memory-tools',
              label: '记忆工具',
              enabled: true,
              health: 'healthy',
              lastError: null,
              lastCheckedAt: '2026-03-30T09:01:00.000Z',
            },
            name: 'recall_memory',
            description: '读取记忆',
            parameters: {
              query: {
                type: 'string',
                required: true,
              },
            },
            pluginId: 'builtin.memory-tools',
            runtimeKind: 'builtin',
          },
        ],
        pluginExecuteTool,
      ),
    });

    const selection = await service.prepareToolSelection({
      context,
    });

    expect(selection.availableTools).toEqual([
      expect.objectContaining({
        name: 'recall_memory',
        toolId: 'plugin:builtin.memory-tools:recall_memory',
      }),
    ]);

    const toolSet = selection.buildToolSet({
      context: {
        ...context,
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
      },
      allowedToolNames: ['recall_memory'],
    });
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await executableToolSet.recall_memory.execute({
      query: '咖啡',
    });

    expect(pluginExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'recall_memory',
        pluginId: 'builtin.memory-tools',
      }),
      params: {
        query: '咖啡',
      },
      context: {
        ...context,
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
      },
      skipLifecycleHooks: true,
    });
  });

  it('applies persisted source and tool enabled overrides to governance listings', async () => {
    const pluginProvider = createProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T13:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
    ]);
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn().mockImplementation((kind: string, id: string) =>
          kind === 'plugin' && id === 'builtin.memory-tools' ? false : undefined),
        getToolEnabled: jest.fn().mockImplementation((toolId: string) =>
          toolId === 'plugin:builtin.memory-tools:save_memory' ? false : undefined),
      },
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
    });

    await expect(service.listSources()).resolves.toEqual([
      expect.objectContaining({
        kind: 'plugin',
        id: 'builtin.memory-tools',
        enabled: false,
        totalTools: 1,
        enabledTools: 0,
      }),
    ]);
    await expect(
      service.listAvailableToolSummaries({
        context,
      }),
    ).resolves.toEqual([]);
  });

  it('runs unified tool lifecycle hooks around MCP tools through the registry', async () => {
    const mcpExecuteTool = jest.fn().mockResolvedValue({
      weather: 'sunny',
    });
    const pluginRuntime = createPluginRuntime();
    pluginRuntime.runToolBeforeCallHooks.mockImplementation(async (input) => ({
      action: 'continue',
      payload: {
        ...input.payload,
        params: {
          city: 'Suzhou',
        },
      },
    }));
    pluginRuntime.runToolAfterCallHooks.mockImplementation(async (input) => ({
      ...input.payload,
      output: {
        ...(input.payload.output as Record<string, unknown>),
        audited: true,
      },
    }));
    const service = createRegistryService({
      settings: {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      },
      pluginRuntime,
      mcpProvider: createProvider('mcp', [
        {
          source: {
            kind: 'mcp',
            id: 'weather',
            label: 'weather',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T17:00:00.000Z',
          },
          name: 'get_forecast',
          description: '获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
      ], mcpExecuteTool),
    });

    const toolSet = await service.buildToolSet({
      context,
      allowedToolNames: ['mcp__weather__get_forecast'],
    });
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await expect(
      executableToolSet.mcp__weather__get_forecast.execute({
        city: 'Shanghai',
      }),
    ).resolves.toEqual({
      weather: 'sunny',
      audited: true,
    });

    expect(pluginRuntime.runToolBeforeCallHooks).toHaveBeenCalledWith({
      context,
      payload: {
        context,
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
        },
        tool: {
          toolId: 'mcp:weather:get_forecast',
          callName: 'mcp__weather__get_forecast',
          name: 'get_forecast',
          description: '[MCP：weather] 获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
        params: {
          city: 'Shanghai',
        },
      },
    });
    expect(mcpExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'get_forecast',
      }),
      params: {
        city: 'Suzhou',
      },
      context,
      skipLifecycleHooks: false,
    });
  });

  it('updates source enabled state from one provider snapshot while preserving tool-level overrides', async () => {
    const settings = createStatefulSettings({
      sourceOverrides: {
        'plugin:builtin.memory-tools': false,
      },
      toolOverrides: {
        'plugin:builtin.memory-tools:recall_memory': false,
      },
    });
    const pluginProvider = createCollectStateProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T18:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T18:00:00.000Z',
        },
        name: 'recall_memory',
        description: '读取记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
    ]);
    const mcpProvider = createCollectStateProvider('mcp', []);
    const pluginService = {
      getPluginScope: jest.fn().mockResolvedValue({
        defaultEnabled: false,
        conversations: {},
      }),
      updatePluginScope: jest.fn().mockResolvedValue({
        defaultEnabled: true,
        conversations: {},
      }),
    };
    const service = createRegistryService({
      settings,
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider,
      pluginService,
    });

    await expect(
      service.setSourceEnabled('plugin', 'builtin.memory-tools', true),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'plugin',
        id: 'builtin.memory-tools',
        enabled: true,
        totalTools: 2,
        enabledTools: 1,
      }),
    );

    expect(pluginService.getPluginScope).toHaveBeenCalledWith('builtin.memory-tools');
    expect(pluginService.updatePluginScope).toHaveBeenCalledWith('builtin.memory-tools', {
      defaultEnabled: true,
      conversations: {},
    });
    expect(settings.setSourceEnabled).toHaveBeenCalledWith(
      'plugin',
      'builtin.memory-tools',
      true,
    );
    expect(pluginProvider.collectState).toHaveBeenCalledTimes(2);
    expect(mcpProvider.collectState).toHaveBeenCalledTimes(2);
  });

  it('syncs MCP runtime state when updating source enabled through unified governance', async () => {
    const settings = createStatefulSettings();
    const pluginProvider = createCollectStateProvider('plugin', []);
    const mcpProvider = createCollectStateProvider('mcp', [
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-03T10:00:00.000Z',
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
      },
    ]);
    const mcpService = {
      setServerEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const service = createRegistryService({
      settings,
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider,
      mcpService,
    });

    await expect(
      service.setSourceEnabled('mcp', 'weather', false),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'mcp',
        id: 'weather',
        enabled: false,
        totalTools: 1,
        enabledTools: 0,
      }),
    );

    expect(settings.setSourceEnabled).toHaveBeenCalledWith('mcp', 'weather', false);
    expect(mcpService.setServerEnabled).toHaveBeenCalledWith('weather', false);
    expect(pluginProvider.collectState).toHaveBeenCalledTimes(2);
    expect(mcpProvider.collectState).toHaveBeenCalledTimes(2);
  });

  it('re-collects skill provider state after toggling the unified skill package source', async () => {
    const settings = createStatefulSettings();
    const pluginProvider = createCollectStateProvider('plugin', []);
    const skillProvider = {
      kind: 'skill' as const,
      collectState: jest.fn().mockImplementation(async () => {
        const disabled = settings.getSourceEnabled('skill', 'active-packages') === false;

        return {
          sources: [
            {
              kind: 'skill' as const,
              id: 'active-packages',
              label: 'Active Skill Packages',
              enabled: true,
              health: 'healthy' as const,
              lastError: null,
              lastCheckedAt: null,
            },
          ],
          tools: disabled
            ? []
            : [
                {
                  source: {
                    kind: 'skill' as const,
                    id: 'active-packages',
                    label: 'Active Skill Packages',
                    enabled: true,
                    health: 'healthy' as const,
                    lastError: null,
                    lastCheckedAt: null,
                  },
                  name: 'asset.list',
                  description: '列出当前会话 skill package 资产',
                  parameters: {},
                },
              ],
        };
      }),
      listSources: jest.fn(),
      listTools: jest.fn(),
      executeTool: jest.fn(),
    };
    const service = createRegistryService({
      settings,
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider: createCollectStateProvider('mcp', []),
      skillProvider,
    });

    await expect(
      service.setSourceEnabled('skill', 'active-packages', false),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'skill',
        id: 'active-packages',
        enabled: false,
        totalTools: 0,
        enabledTools: 0,
      }),
    );

    expect(settings.setSourceEnabled).toHaveBeenCalledWith('skill', 'active-packages', false);
    expect(skillProvider.collectState).toHaveBeenCalledTimes(2);
  });

  it('preserves plugin conversation overrides when updating unified plugin source enabled state', async () => {
    const settings = createStatefulSettings();
    const pluginProvider = createCollectStateProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'remote.pc-host',
          label: '电脑助手',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-03T12:00:00.000Z',
        },
        name: 'take_screenshot',
        description: '截图',
        parameters: {},
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
    ]);
    const pluginService = {
      getPluginScope: jest.fn().mockResolvedValue({
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      }),
      updatePluginScope: jest.fn().mockResolvedValue({
        defaultEnabled: false,
        conversations: {
          'conversation-1': false,
        },
      }),
    };
    const service = createRegistryService({
      settings,
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider: createCollectStateProvider('mcp', []),
      pluginService,
    });

    await service.setSourceEnabled('plugin', 'remote.pc-host', false);

    expect(pluginService.updatePluginScope).toHaveBeenCalledWith('remote.pc-host', {
      defaultEnabled: false,
      conversations: {
        'conversation-1': false,
      },
    });
  });

  it('updates tool enabled state from one provider snapshot without re-reading all sources', async () => {
    const settings = createStatefulSettings({
      toolOverrides: {
        'plugin:builtin.memory-tools:save_memory': false,
      },
    });
    const pluginProvider = createCollectStateProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T19:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
    ]);
    const mcpProvider = createCollectStateProvider('mcp', []);
    const service = createRegistryService({
      settings,
      pluginRuntime: createPluginRuntime(),
      pluginProvider,
      mcpProvider,
    });

    await expect(
      service.setToolEnabled('plugin:builtin.memory-tools:save_memory', true),
    ).resolves.toEqual(
      expect.objectContaining({
        toolId: 'plugin:builtin.memory-tools:save_memory',
        enabled: true,
      }),
    );

    expect(settings.setToolEnabled).toHaveBeenCalledWith(
      'plugin:builtin.memory-tools:save_memory',
      true,
    );
    expect(pluginProvider.collectState).toHaveBeenCalledTimes(1);
    expect(mcpProvider.collectState).toHaveBeenCalledTimes(1);
  });
});
