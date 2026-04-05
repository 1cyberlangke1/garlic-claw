import type {
  PluginCallContext,
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';
import { PluginRuntimeBroadcastFacade } from './plugin-runtime-broadcast.facade';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeInboundHooksFacade } from './plugin-runtime-inbound-hooks.facade';
import { PluginRuntimeMessageHooksFacade } from './plugin-runtime-message-hooks.facade';
import { PluginRuntimeOperationHooksFacade } from './plugin-runtime-operation-hooks.facade';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import { PluginRuntimeTransportFacade } from './plugin-runtime-transport.facade';
import { PluginSubagentTaskService } from './plugin-subagent-task.service';
import { ChatMessageService } from '../chat/chat-message.service';
import { ToolRegistryService } from '../tool/tool-registry.service';

export interface PluginRuntimeSpecFixture {
  service: PluginRuntimeService;
  pluginService: {
    registerPlugin: jest.Mock;
    setOffline: jest.Mock;
    heartbeat: jest.Mock;
    getGovernanceSnapshot: jest.Mock;
    recordPluginEvent: jest.Mock;
    recordPluginSuccess: jest.Mock;
    recordPluginFailure: jest.Mock;
  };
  hostService: {
    call: jest.Mock;
  };
  cronService: {
    onPluginRegistered: jest.Mock;
    onPluginUnregistered: jest.Mock;
    registerCron: jest.Mock;
    listCronJobs: jest.Mock;
    deleteCron: jest.Mock;
  };
  aiModelExecution: {
    resolveModelConfig: jest.Mock;
    prepareResolved: jest.Mock;
    streamPrepared: jest.Mock;
  };
  automationService: {
    create: jest.Mock;
    findAllByUser: jest.Mock;
    toggle: jest.Mock;
    executeAutomation: jest.Mock;
    emitEvent: jest.Mock;
  };
  chatMessageService: {
    getCurrentPluginMessageTarget: jest.Mock;
    sendPluginMessage: jest.Mock;
  };
  toolRegistry: {
    buildToolSet: jest.Mock;
    listAvailableToolSummaries: jest.Mock;
  };
  subagentTaskService: {
    startTask: jest.Mock;
    listTasksForPlugin: jest.Mock;
    getTaskForPlugin: jest.Mock;
  };
  moduleRef: {
    get: jest.Mock;
  };
  callContext: PluginCallContext;
  builtinManifest: PluginManifest;
  memoryContextConfigSchema: PluginConfigSchema;
  createTransport: (overrides?: {
    executeTool?: jest.Mock;
    invokeHook?: jest.Mock;
    invokeRoute?: jest.Mock;
    reload?: jest.Mock;
    reconnect?: jest.Mock;
    checkHealth?: jest.Mock;
    listSupportedActions?: jest.Mock;
  }) => {
    executeTool: jest.Mock;
    invokeHook: jest.Mock;
    invokeRoute: jest.Mock;
    reload?: jest.Mock;
    reconnect?: jest.Mock;
    checkHealth?: jest.Mock;
    listSupportedActions?: jest.Mock;
  };
}

export function createPluginRuntimeSpecFixture(): PluginRuntimeSpecFixture {
  const pluginService = {
    registerPlugin: jest.fn(),
    setOffline: jest.fn(),
    heartbeat: jest.fn(),
    getGovernanceSnapshot: jest.fn(),
    recordPluginEvent: jest.fn(),
    recordPluginSuccess: jest.fn(),
    recordPluginFailure: jest.fn(),
  };
  const hostService = {
    call: jest.fn(),
  };
  const cronService = {
    onPluginRegistered: jest.fn(),
    onPluginUnregistered: jest.fn(),
    registerCron: jest.fn(),
    listCronJobs: jest.fn(),
    deleteCron: jest.fn(),
  };
  const aiModelExecution = {
    resolveModelConfig: jest.fn(),
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };
  const automationService = {
    create: jest.fn(),
    findAllByUser: jest.fn(),
    toggle: jest.fn(),
    executeAutomation: jest.fn(),
    emitEvent: jest.fn(),
  };
  const chatMessageService = {
    getCurrentPluginMessageTarget: jest.fn(),
    sendPluginMessage: jest.fn(),
  };
  const toolRegistry = {
    buildToolSet: jest.fn(),
    listAvailableToolSummaries: jest.fn(),
  };
  const subagentTaskService = {
    startTask: jest.fn(),
    listTasksForPlugin: jest.fn(),
    getTaskForPlugin: jest.fn(),
  };
  const moduleRef = {
    get: jest.fn(),
  };
  const callContext: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
  };
  const builtinManifest: PluginManifest = {
    id: 'builtin.memory-tools',
    name: '记忆工具',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read', 'memory:write', 'state:read', 'state:write'],
    tools: [
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
      },
    ],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
  };
  const memoryContextConfigSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        description: '记忆检索数量',
        defaultValue: 5,
      },
    ],
  };

  pluginService.registerPlugin.mockResolvedValue({
    configSchema: null,
    resolvedConfig: {},
    scope: {
      defaultEnabled: true,
      conversations: {},
    },
  });
  pluginService.getGovernanceSnapshot.mockResolvedValue({
    configSchema: null,
    resolvedConfig: {},
    scope: {
      defaultEnabled: true,
      conversations: {},
    },
  });
  cronService.onPluginRegistered.mockResolvedValue(undefined);
  cronService.onPluginUnregistered.mockResolvedValue(undefined);
  aiModelExecution.resolveModelConfig.mockReturnValue({
    id: 'gpt-5.2',
    providerId: 'openai',
    capabilities: {
      input: { text: true, image: false },
      output: { text: true, image: false },
      reasoning: true,
      toolCall: true,
    },
  });
  moduleRef.get.mockImplementation((token: unknown) => {
    if (token === ChatMessageService) {
      return chatMessageService;
    }
    if (token === ToolRegistryService) {
      return toolRegistry;
    }
    if (token === PluginSubagentTaskService) {
      return subagentTaskService;
    }
    return automationService;
  });
  toolRegistry.buildToolSet.mockResolvedValue(undefined);
  toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
  subagentTaskService.startTask.mockResolvedValue({
    id: 'subagent-task-1',
    pluginId: 'builtin.subagent-delegate',
    pluginDisplayName: '子代理委派',
    runtimeKind: 'builtin',
    status: 'queued',
    requestPreview: '请帮我总结当前对话',
    providerId: 'openai',
    modelId: 'gpt-5.2',
    writeBackStatus: 'pending',
    writeBackTarget: {
      type: 'conversation',
      id: 'conversation-1',
    },
    requestedAt: '2026-03-30T12:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    conversationId: 'conversation-1',
    userId: 'user-1',
  });
  subagentTaskService.listTasksForPlugin.mockResolvedValue([]);
  subagentTaskService.getTaskForPlugin.mockResolvedValue(null);

  const runtimeAutomationFacade = new PluginRuntimeAutomationFacade(
    cronService as never,
    moduleRef as never,
  );
  const runtimeBroadcastFacade = new PluginRuntimeBroadcastFacade();
  const runtimeGovernanceFacade = new PluginRuntimeGovernanceFacade();
  const runtimeHostFacade = new PluginRuntimeHostFacade(
    pluginService as never,
    hostService as never,
    runtimeAutomationFacade as never,
    moduleRef as never,
  );
  const runtimeInboundHooksFacade = new PluginRuntimeInboundHooksFacade();
  const runtimeMessageHooksFacade = new PluginRuntimeMessageHooksFacade();
  const runtimeOperationHooksFacade = new PluginRuntimeOperationHooksFacade();
  const runtimeSubagentFacade = new PluginRuntimeSubagentFacade(
    aiModelExecution as never,
    moduleRef as never,
  );
  const runtimeTransportFacade = new PluginRuntimeTransportFacade(
    pluginService as never,
  );
  const service = new PluginRuntimeService(
    runtimeBroadcastFacade as never,
    runtimeGovernanceFacade as never,
    runtimeHostFacade as never,
    runtimeInboundHooksFacade as never,
    runtimeMessageHooksFacade as never,
    runtimeOperationHooksFacade as never,
    runtimeSubagentFacade as never,
    runtimeTransportFacade as never,
  );

  function createTransport(overrides?: {
    executeTool?: jest.Mock;
    invokeHook?: jest.Mock;
    invokeRoute?: jest.Mock;
    reload?: jest.Mock;
    reconnect?: jest.Mock;
    checkHealth?: jest.Mock;
    listSupportedActions?: jest.Mock;
  }) {
    return {
      executeTool: jest.fn(),
      invokeHook: jest.fn(),
      invokeRoute: jest.fn(),
      ...overrides,
    };
  }

  return {
    service,
    pluginService,
    hostService,
    cronService,
    aiModelExecution,
    automationService,
    chatMessageService,
    toolRegistry,
    subagentTaskService,
    moduleRef,
    callContext,
    builtinManifest,
    memoryContextConfigSchema,
    createTransport,
  };
}
