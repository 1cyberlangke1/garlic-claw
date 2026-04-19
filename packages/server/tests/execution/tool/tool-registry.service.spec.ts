import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/execution/automation/automation.service';
import { SkillRegistryService } from '../../../src/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/execution/skill/skill-tool.service';
import { BuiltinPluginRegistryService } from '../../../src/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { PersonaService } from '../../../src/persona/persona.service';
import { PersonaStoreService } from '../../../src/persona/persona-store.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/runtime/gateway/runtime-gateway-remote-transport.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from '../../../src/runtime/host/runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from '../../../src/runtime/host/runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from '../../../src/runtime/host/runtime-host-plugin-runtime.service';
import { RuntimeHostService } from '../../../src/runtime/host/runtime-host.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentTaskStoreService } from '../../../src/runtime/host/runtime-host-subagent-task-store.service';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';
import { RuntimePluginGovernanceService } from '../../../src/runtime/kernel/runtime-plugin-governance.service';
import { ToolRegistryService } from '../../../src/execution/tool/tool-registry.service';

describe('ToolRegistryService', () => {
  it('lists plugin tool sources and tool records', async () => {
    const { service } = createFixture();

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin.memory-tools',
          kind: 'plugin',
          totalTools: 2,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'plugin:builtin.memory-tools:save_memory',
        }),
        expect.objectContaining({
          toolId: 'plugin:builtin.memory-tools:search_memory',
        }),
      ]),
    }));
  });

  it('lists MCP tool sources and tool records', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          kind: 'mcp',
          id: 'weather',
          totalTools: 1,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'mcp:weather:get_forecast',
          sourceKind: 'mcp',
          sourceId: 'weather',
          parameters: {
            city: {
              type: 'string',
              required: true,
              description: 'City name',
            },
          },
        }),
      ]),
    }));
  });

  it('includes native skill tool in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toContain('skill');
  });

  it('updates source and tool enabled flags and dispatches plugin source actions', async () => {
    const { runtimePluginGovernanceService, service } = createFixture();
    runtimePluginGovernanceService.runPluginAction = jest.fn().mockImplementation(async ({ action, pluginId }) => ({
      accepted: true,
      action,
      pluginId,
      message: action === 'health-check' ? '插件健康检查通过' : '已重新装载本地插件',
    })) as never;

    await expect(
      service.setSourceEnabled('plugin', 'builtin.memory-tools', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        id: 'builtin.memory-tools',
      }),
    );
    await expect(
      service.setToolEnabled('plugin:builtin.memory-tools:save_memory', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        toolId: 'plugin:builtin.memory-tools:save_memory',
      }),
    );
    await expect(
      service.runSourceAction('plugin', 'builtin.memory-tools', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: '插件健康检查通过',
    });
    await expect(
      service.runSourceAction('plugin', 'builtin.memory-tools', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: '已重新装载本地插件',
    });
  });

  it('updates MCP source enabled flags and dispatches MCP source actions', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [],
    });
    mcpService.setServerEnabled.mockResolvedValue(undefined);
    mcpService.runGovernanceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });

    await expect(service.setSourceEnabled('mcp', 'weather', false)).resolves.toEqual(
      expect.objectContaining({
        kind: 'mcp',
        id: 'weather',
      }),
    );
    await expect(service.runSourceAction('mcp', 'weather', 'health-check')).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });
    expect(mcpService.setServerEnabled).toHaveBeenCalledWith('weather', false);
  });

  it('filters out tools disabled for the current conversation scope', async () => {
    const { pluginBootstrapService, service } = createFixture();
    const builtinPersisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    builtinPersisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('builtin.memory-tools'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      lastSeenAt: new Date().toISOString(),
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      governance: {
        defaultEnabled: false,
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索记忆',
            name: 'search_memory',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('remote.memory-tools'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
        'conversation-2': true,
      },
      defaultEnabled: false,
      lastSeenAt: new Date().toISOString(),
    });

    await expect(service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    })).resolves.toEqual(expect.objectContaining({
      skill: expect.any(Object),
    }));

    const enabledTools = await service.buildToolSet({
      context: {
        conversationId: 'conversation-2',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(enabledTools).toBeDefined();
    expect(Object.keys(enabledTools ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'skill',
    ]);
  });

  it('includes builtin tools in the executable tool set when enabled', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'skill',
    ]);
  });

  it('includes MCP tools in the executable tool set and dispatches execution through McpService', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });
    mcpService.callTool.mockResolvedValue({ forecast: 'sunny' });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const mcpTool = toolSet?.weather__get_forecast;
    expect(mcpTool).toBeDefined();
    const result = await (mcpTool as any).execute({ city: 'Shanghai' }, {} as never);

    expect(Object.keys(toolSet ?? {})).toContain('weather__get_forecast');
    expect(result).toEqual({ forecast: 'sunny' });
    expect(mcpService.callTool).toHaveBeenCalledWith({
      arguments: { city: 'Shanghai' },
      serverName: 'weather',
      toolName: 'get_forecast',
    });
  });

  it('dispatches native skill tool execution through the skill owner', async () => {
    const { service, skillRegistryService } = createFixture();
    skillRegistryService.getSkillByName.mockResolvedValue({
      id: 'project/planner',
      name: 'planner',
      description: '先拆任务，再逐步执行。',
      content: '# planner\n\n先拆任务，再逐步执行。',
      entryPath: 'planner/SKILL.md',
      governance: { loadPolicy: 'allow' },
      promptPreview: '先拆任务，再逐步执行。',
      sourceKind: 'project',
      tags: [],
      assets: [{ path: 'templates/task.md', kind: 'template', textReadable: true, executable: false }],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['skill'],
    });
    const skillTool = toolSet?.skill;
    expect(skillTool).toBeDefined();
    const result = await (skillTool as any).execute({ name: 'planner' }, {} as never);

    expect(result).toEqual(expect.objectContaining({
      name: 'planner',
      entryPath: 'planner/SKILL.md',
    }));
    expect(skillRegistryService.getSkillByName).toHaveBeenCalledWith('planner');
  });

  it('excludes disconnected remote plugins from the executable tool set', async () => {
    const { pluginBootstrapService, service } = createFixture();
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索远端记忆',
            name: 'remote_search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.markPluginOffline('remote.memory-tools');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(Object.keys(toolSet ?? {})).not.toContain('remote_search');
  });
});

function createFixture() {
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
  );
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory-tools',
      name: '记忆工具',
      runtime: 'local',
    },
    manifest: {
      permissions: [],
      tools: [
        {
          description: '保存记忆',
          name: 'save_memory',
          parameters: {},
        },
        {
          description: '搜索记忆',
          name: 'search_memory',
          parameters: {},
        },
      ],
      version: '1.0.0',
    } as never,
  });

  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  const runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
  const runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
    runtimeHostConversationRecordService,
  );
  const aiModelExecutionService = new AiModelExecutionService();
  const runtimeHostSubagentRunnerService = new RuntimeHostSubagentRunnerService(
    aiModelExecutionService,
    runtimeHostConversationMessageService,
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
    } as never,
    new RuntimeHostSubagentTaskStoreService(),
  );
  const runtimeHostAutomationService = new AutomationService(
    new AutomationExecutionService(
      {
        executeTool: jest.fn(),
        invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      {
        sendMessage: async () => {
          throw new Error('RuntimeHostConversationMessageService is not available');
        },
      } as never,
    ),
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const runtimeHostPluginDispatchService = new RuntimeHostPluginDispatchService(
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayRemoteTransportService,
  );
  const runtimeHostService = new RuntimeHostService(
    pluginBootstrapService,
    runtimeHostAutomationService,
    runtimeHostConversationMessageService,
    runtimeHostConversationRecordService,
    aiModelExecutionService as never,
    aiManagementService,
    new RuntimeHostKnowledgeService(),
    runtimeHostPluginDispatchService,
    new RuntimeHostPluginRuntimeService(),
    runtimeHostSubagentRunnerService,
    new RuntimeHostUserContextService(),
    new PersonaService(new PersonaStoreService(), runtimeHostConversationRecordService),
  );
  runtimeHostService.onModuleInit();
  const runtimePluginGovernanceService = new RuntimePluginGovernanceService(
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
  );

  const mcpService: {
    callTool: jest.Mock;
    getToolingSnapshot: jest.Mock;
    listToolSources: jest.Mock;
    runGovernanceAction: jest.Mock;
    setServerEnabled: jest.Mock;
  } = {
    callTool: jest.fn(),
    getToolingSnapshot: jest.fn().mockReturnValue({ statuses: [], tools: [] }),
    listToolSources: jest.fn(),
    runGovernanceAction: jest.fn(),
    setServerEnabled: jest.fn(),
  };
  mcpService.listToolSources.mockImplementation(() => buildMcpToolSources(mcpService.getToolingSnapshot()));
  const skillRegistryService = {
    getSkillByName: jest.fn(),
    listSkillSummaries: jest.fn().mockResolvedValue([
      {
        id: 'project/planner',
        name: 'planner',
        description: '先拆任务，再逐步执行。',
        entryPath: 'planner/SKILL.md',
        governance: { loadPolicy: 'allow' },
        promptPreview: '先拆任务，再逐步执行。',
        sourceKind: 'project',
        tags: [],
      },
    ]),
    resolveSkillDirectory: jest.fn().mockReturnValue('D:/repo/skills/planner'),
  };
  const skillToolService = new SkillToolService(skillRegistryService as unknown as SkillRegistryService);

  return {
    mcpService,
    pluginBootstrapService,
    runtimePluginGovernanceService,
    skillRegistryService,
    service: new ToolRegistryService(
      mcpService as never,
      skillToolService,
      runtimeHostPluginDispatchService as never,
      runtimePluginGovernanceService as never,
    ),
  };
}

function buildMcpToolSources(snapshot: {
  statuses: Array<{ connected: boolean; enabled: boolean; health: string; lastCheckedAt: string | null; lastError: string | null; name: string }>;
  tools: Array<{ description?: string; inputSchema?: { properties?: Record<string, { description?: string; type?: string }>; required?: string[] } | null; name: string; serverName: string }>;
}) {
  return snapshot.statuses.map((status) => {
    const tools = snapshot.tools
      .filter((tool) => tool.serverName === status.name)
      .map((tool) => ({
        toolId: `mcp:${status.name}:${tool.name}`,
        name: tool.name,
        callName: `${status.name}__${tool.name}`,
        description: tool.description ?? tool.name,
        parameters: Object.fromEntries(Object.entries(tool.inputSchema?.properties ?? {}).map(([key, schema]) => [key, { description: schema.description, required: (tool.inputSchema?.required ?? []).includes(key), type: schema.type === 'number' || schema.type === 'boolean' || schema.type === 'object' || schema.type === 'array' ? schema.type : 'string' }])),
        enabled: status.enabled,
        sourceKind: 'mcp' as const,
        sourceId: status.name,
        sourceLabel: status.name,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
      }));
    return {
      source: {
        kind: 'mcp' as const,
        id: status.name,
        label: status.name,
        enabled: status.enabled,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
        totalTools: tools.length,
        enabledTools: status.enabled ? tools.length : 0,
        supportedActions: ['health-check', 'reconnect', 'reload'],
      },
      tools,
    };
  });
}
