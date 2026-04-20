import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/execution/automation/automation.service';
import { InvalidToolService } from '../../../src/execution/invalid/invalid-tool.service';
import { SkillRegistryService } from '../../../src/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/execution/skill/skill-tool.service';
import { TaskToolService } from '../../../src/execution/task/task-tool.service';
import { TodoToolService } from '../../../src/execution/todo/todo-tool.service';
import { WebFetchToolService } from '../../../src/execution/webfetch/webfetch-tool.service';
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
import { RuntimeHostSubagentTypeRegistryService } from '../../../src/runtime/host/runtime-host-subagent-type-registry.service';
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

  it('includes native task, todowrite and webfetch tools in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual(expect.arrayContaining([
      'task',
      'todowrite',
      'webfetch',
    ]));
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
      'task',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
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
      'task',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
    ]);
  });

  it('does not expose internal invalid tool in the available tool summary list', async () => {
    const { service } = createFixture();

    const tools = await service.listAvailableTools({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(tools.map((entry) => entry.name)).not.toContain('invalid');
  });

  it('dispatches native webfetch tool execution through the webfetch owner', async () => {
    const { service, webFetchService } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();
    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    }, {} as never);
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-1',
    });

    expect(result).toEqual(expect.objectContaining({
      format: 'markdown',
      title: 'Smoke Example',
      url: 'https://example.com/smoke',
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<webfetch_result>'),
    }));
    expect(webFetchService.fetch).toHaveBeenCalledWith({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
  });

  it('converts recoverable tool execution errors into internal invalid results', async () => {
    const { service, webFetchService } = createFixture();
    webFetchService.fetch.mockRejectedValueOnce(new Error('request timeout'));

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();

    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    }, {} as never);
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-failed-1',
    });

    expect(result).toEqual({
      error: 'request timeout',
      inputText: JSON.stringify({
        format: 'markdown',
        url: 'https://example.com/smoke',
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'webfetch',
      type: 'invalid-tool-result',
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<invalid_tool_result>'),
    }));
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
    const modelOutput = await (skillTool as any).toModelOutput({
      input: { name: 'planner' },
      output: result,
      toolCallId: 'call-skill-1',
    });

    expect(result).toEqual(expect.objectContaining({
      name: 'planner',
      entryPath: 'planner/SKILL.md',
      modelOutput: expect.stringContaining('<skill_content name="planner">'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<skill_content name="planner">'),
    }));
    expect(skillRegistryService.getSkillByName).toHaveBeenCalledWith('planner');
  });

  it('dispatches native task tool execution through the subagent runner owner', async () => {
    const { runtimeHostSubagentRunnerService, service } = createFixture();
    const runSubagentSpy = runtimeHostSubagentRunnerService.runSubagent as jest.Mock;

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['task'],
    });
    const taskTool = toolSet?.task;
    expect(taskTool).toBeDefined();

    const result = await (taskTool as any).execute({
      description: '仓库探索',
      subagentType: 'explore',
      prompt: '请总结当前仓库的技能目录',
    }, {} as never);
    const modelOutput = await (taskTool as any).toModelOutput({
      input: {
        description: '仓库探索',
        subagentType: 'explore',
        prompt: '请总结当前仓库的技能目录',
      },
      output: result,
      toolCallId: 'call-task-1',
    });

    expect(result).toEqual(expect.objectContaining({
      description: '仓库探索',
      subagentType: 'explore',
      taskId: expect.any(String),
      text: 'Generated: 请总结当前仓库的技能目录',
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<task_result title="仓库探索">'),
    }));
    expect(runSubagentSpy).toHaveBeenCalledWith('native.task', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, expect.objectContaining({
      description: '仓库探索',
      messages: [
        {
          content: '请总结当前仓库的技能目录',
          role: 'user',
        },
      ],
      subagentType: 'explore',
    }));
  });

  it('dispatches native todowrite tool execution through the session todo owner', async () => {
    const { conversationId, runtimeHostConversationRecordService, service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['todowrite'],
    });
    const todoTool = toolSet?.todowrite;
    expect(todoTool).toBeDefined();
    const todos = [
      { content: '分析现有实现', priority: 'high' as const, status: 'completed' as const },
      { content: '实现 todo 工具', priority: 'high' as const, status: 'in_progress' as const },
    ];
    const result = await (todoTool as any).execute({ todos }, {} as never);
    const modelOutput = await (todoTool as any).toModelOutput({
      input: { todos },
      output: result,
      toolCallId: 'call-todo-1',
    });

    expect(result).toEqual({
      sessionId: conversationId,
      pendingCount: 1,
      todos,
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<todo_result>'),
    }));
    expect(runtimeHostConversationRecordService.readSessionTodo(conversationId)).toEqual(todos);
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
  const conversationId = (runtimeHostConversationRecordService.createConversation({
    title: 'Tool Registry Todo',
    userId: 'user-1',
  }) as { id: string }).id;
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
      listPlugins: jest.fn().mockReturnValue([]),
    } as never,
    new RuntimeHostSubagentTaskStoreService(),
  );
  jest.spyOn(runtimeHostSubagentRunnerService, 'runSubagent').mockResolvedValue({
    finishReason: 'stop',
    message: {
      content: 'Generated: 请总结当前仓库的技能目录',
      role: 'assistant',
    },
    modelId: 'gpt-5.4',
    providerId: 'openai',
    sessionId: 'subagent-session-1',
    sessionMessageCount: 2,
    taskId: 'subagent-task-inline-1',
    text: 'Generated: 请总结当前仓库的技能目录',
    toolCalls: [],
    toolResults: [],
  } as never);
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
  const invalidToolService = new InvalidToolService();
  const taskToolService = new TaskToolService(new RuntimeHostSubagentTypeRegistryService());
  const todoToolService = new TodoToolService(runtimeHostConversationRecordService as never);
  const webFetchService = {
    fetch: jest.fn().mockResolvedValue({
      contentType: 'text/html',
      format: 'markdown',
      output: '# Smoke Example\n\nbody',
      status: 200,
      title: 'Smoke Example',
      url: 'https://example.com/smoke',
    }),
  };
  const webFetchToolService = new WebFetchToolService(webFetchService as never);

  return {
    conversationId,
    mcpService,
    pluginBootstrapService,
    runtimeHostConversationRecordService,
    runtimePluginGovernanceService,
    runtimeHostSubagentRunnerService,
    skillRegistryService,
    webFetchService,
    service: new ToolRegistryService(
      mcpService as never,
      invalidToolService,
      todoToolService,
      webFetchToolService,
      skillToolService,
      taskToolService,
      {
        get: jest.fn().mockImplementation((token) => token === RuntimeHostSubagentRunnerService ? runtimeHostSubagentRunnerService : null),
      } as never,
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
