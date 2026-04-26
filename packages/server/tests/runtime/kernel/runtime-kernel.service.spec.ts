import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/execution/automation/automation.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';
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
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from '../../../src/runtime/host/runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from '../../../src/runtime/host/runtime-host-subagent-store.service';
import { RuntimeHostService } from '../../../src/runtime/host/runtime-host.service';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';
import { RuntimePluginGovernanceService } from '../../../src/runtime/kernel/runtime-plugin-governance.service';

describe('RuntimePluginGovernanceService', () => {
  it('registers remote plugins and routes host/tool/hook/route calls', async () => {
    const fixture = createService();
    const { runtimeGatewayConnectionLifecycleService, runtimeHostPluginDispatchService, service } = fixture;

    seedRemotePlugin(fixture);

    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        hooks: [
          {
            name: 'chat:before-model',
          },
        ],
        permissions: ['memory:read'],
        routes: [
          {
            methods: ['GET'],
            path: 'inspect/context',
          },
        ],
        tools: [
          {
            description: 'search memory',
            name: 'memory.search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });

    const toolPromise = runtimeHostPluginDispatchService.executeTool({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-tool',
        userId: 'user-1',
      },
      params: {
        query: 'coffee',
      },
      pluginId: 'remote.echo',
      toolName: 'memory.search',
    });
    const hookPromise = runtimeHostPluginDispatchService.invokeHook({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-hook',
        userId: 'user-1',
      },
      hookName: 'chat:before-model',
      payload: {
        content: 'hello',
      },
      pluginId: 'remote.echo',
    });
    const routePromise = runtimeHostPluginDispatchService.invokeRoute({
      context: {
        conversationId: 'conversation-1',
        source: 'http-route',
        userId: 'user-1',
      },
      pluginId: 'remote.echo',
      request: {
        body: null,
        headers: {},
        method: 'GET',
        path: '/inspect/context/',
        query: {},
      },
    });

    const outbound = fixture.runtimeGatewayRemoteTransportService.consumeOutboundMessages('conn-1');
    expect(outbound).toHaveLength(3);
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[0].requestId,
      result: {
        items: [{ id: 'memory-1' }],
      },
    });
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[1].requestId,
      result: {
        action: 'continue',
      },
    });
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[2].requestId,
      result: {
        body: {
          ok: true,
        },
        status: 200,
      },
    });

    await expect(toolPromise).resolves.toEqual({
      items: [{ id: 'memory-1' }],
    });
    await expect(hookPromise).resolves.toEqual({
      action: 'continue',
    });
    await expect(routePromise).resolves.toEqual({
      body: {
        ok: true,
      },
      status: 200,
    });
    expect(runtimeHostPluginDispatchService.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'remote.echo',
      }),
    ]);
    expect(service.listSupportedActions('remote.echo')).toEqual([
      'health-check',
      'reload',
      'reconnect',
      'refresh-metadata',
    ]);
  });

  it('does not expose reload for ordinary local plugins and still reports health actions', async () => {
    const { pluginBootstrapService, service } = createService();
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'local.memory-context',
        name: 'Local Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.markPluginOffline('local.memory-context');

    expect(service.listSupportedActions('local.memory-context')).toEqual(['health-check']);
    await expect(
      service.runPluginAction({
        action: 'health-check',
        pluginId: 'local.memory-context',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      pluginId: 'local.memory-context',
      message: '插件健康检查失败',
    });
    await expect(
      service.runPluginAction({
        action: 'reload',
        pluginId: 'local.memory-context',
      }),
    ).rejects.toThrow('does not support action reload');
    expect(pluginBootstrapService.getPlugin('local.memory-context')).toMatchObject({
      connected: false,
      pluginId: 'local.memory-context',
    });
    await expect(
      service.runPluginAction({
        action: 'reconnect',
        pluginId: 'local.memory-context',
      }),
    ).rejects.toThrow('does not support action reconnect');
  });

  it('invokes builtin hooks through builtin plugin definitions', async () => {
    const { builtinPluginRegistryService, runtimeHostPluginDispatchService } = createService();
    const beforeRunHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      messages: [
        {
          content: 'builtin hook mutated prompt',
          role: 'user',
        },
      ],
    });

    (builtinPluginRegistryService as unknown as {
      definitions: Array<Record<string, unknown>>;
    }).definitions = [
      {
        hooks: {
          'subagent:before-run': beforeRunHook,
        },
        manifest: {
          hooks: [{ name: 'subagent:before-run' }],
          id: 'builtin.subagent-observer',
          name: 'Builtin Subagent Observer',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
      },
    ];
    runtimeHostPluginDispatchService['pluginBootstrapService'].bootstrapBuiltins();

    await expect(
      runtimeHostPluginDispatchService.invokeHook({
        context: {
          conversationId: 'conversation-1',
          source: 'plugin',
          userId: 'user-1',
        },
        hookName: 'subagent:before-run',
        payload: {
          request: {
            messages: [
              {
                content: 'original prompt',
                role: 'user',
              },
            ],
          },
        },
        pluginId: 'builtin.subagent-observer',
      }),
    ).resolves.toEqual({
      action: 'mutate',
      messages: [
        {
          content: 'builtin hook mutated prompt',
          role: 'user',
        },
      ],
    });
    expect(beforeRunHook).toHaveBeenCalledWith({
      request: {
        messages: [
          {
            content: 'original prompt',
            role: 'user',
          },
        ],
      },
    }, expect.objectContaining({
      callContext: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      host: expect.any(Object),
    }));
  });

  it('performs remote health checks through the remote transport ping path', async () => {
    const fixture = createService();
    const { runtimeGatewayConnectionLifecycleService, service } = fixture;

    seedRemotePlugin(fixture);
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });
    runtimeGatewayConnectionLifecycleService.probePluginHealth = jest.fn().mockResolvedValue({ ok: false });

    await expect(
      service.runPluginAction({
        action: 'health-check',
        pluginId: 'remote.echo',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      pluginId: 'remote.echo',
      message: '插件健康检查失败',
    });
    expect(runtimeGatewayConnectionLifecycleService.probePluginHealth).toHaveBeenCalledWith('remote.echo');
  });

  it('refreshes remote metadata cache after the plugin reconnects with a changed manifest', async () => {
    const fixture = createService();
    const { pluginBootstrapService, runtimeGatewayConnectionLifecycleService, service } = fixture;

    seedRemotePlugin(fixture);
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        description: 'initial manifest',
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });

    const initialPlugin = pluginBootstrapService.getPlugin('remote.echo');
    const initialLastSyncedAt = initialPlugin.remote?.metadataCache.lastSyncedAt;
    const initialManifestHash = initialPlugin.remote?.metadataCache.manifestHash;

    await expect(
      service.runPluginAction({
        action: 'refresh-metadata',
        pluginId: 'remote.echo',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'refresh-metadata',
      pluginId: 'remote.echo',
      message: '已请求远程插件重新同步元数据',
    });
    expect(pluginBootstrapService.getPlugin('remote.echo')).toMatchObject({
      connected: false,
      status: 'offline',
    });

    runtimeGatewayConnectionLifecycleService.openConnection({
      connectionId: 'conn-2',
    });
    runtimeGatewayConnectionLifecycleService.authenticateConnection({
      accessKey: 'smoke-access-key',
      connectionId: 'conn-2',
      pluginName: 'remote.echo',
      remoteEnvironment: 'api',
    });
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-2',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        description: 'refreshed manifest',
        permissions: [],
        tools: [],
        version: '1.0.1',
      } as never,
      remoteEnvironment: 'api',
    });

    const refreshedPlugin = pluginBootstrapService.getPlugin('remote.echo');
    expect(refreshedPlugin).toMatchObject({
      connected: true,
      manifest: {
        description: 'refreshed manifest',
        version: '1.0.1',
      },
      remote: {
        metadataCache: {
          status: 'cached',
        },
      },
    });
    expect(Date.parse(refreshedPlugin.remote?.metadataCache.lastSyncedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(initialLastSyncedAt ?? ''),
    );
    expect(refreshedPlugin.remote?.metadataCache.manifestHash).not.toBe(initialManifestHash);
  });
});

function seedRemotePlugin(input: ReturnType<typeof createService>) {
  input.pluginBootstrapService.upsertRemotePlugin({
    access: {
      accessKey: 'smoke-access-key',
      serverUrl: 'ws://127.0.0.1:23331',
    },
    displayName: 'Remote Echo',
    pluginName: 'remote.echo',
    remote: {
      auth: {
        mode: 'required',
      },
      capabilityProfile: 'query',
      remoteEnvironment: 'api',
    },
    version: '1.0.0',
  });
  input.runtimeGatewayConnectionLifecycleService.authenticateConnection({
    accessKey: 'smoke-access-key',
    connectionId: 'conn-1',
    pluginName: 'remote.echo',
    remoteEnvironment: 'api',
  });
}

function createService() {
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
    builtinPluginRegistryService,
  );
  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  runtimeGatewayConnectionLifecycleService.openConnection({
    connectionId: 'conn-1',
  });
  const runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
  const runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
    runtimeHostConversationRecordService,
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
    new RuntimeHostSubagentStoreService(),
    new RuntimeHostSubagentSessionStoreService(),
    new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
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
      {
        executeRegisteredTool: jest.fn(),
      } as never,
    ),
  );
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
    {} as never,
    runtimeHostSubagentRunnerService,
    new RuntimeHostUserContextService(),
    new PersonaService(new PersonaStoreService(new ProjectWorktreeRootService()), runtimeHostConversationRecordService),
  );
  runtimeHostService.onModuleInit();
  return {
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
    runtimeGatewayRemoteTransportService,
    runtimeHostPluginDispatchService,
    service: new RuntimePluginGovernanceService(
      pluginBootstrapService,
      runtimeGatewayConnectionLifecycleService,
    ),
  };
}
