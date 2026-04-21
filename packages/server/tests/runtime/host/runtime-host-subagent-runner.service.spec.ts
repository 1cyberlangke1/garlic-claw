const mockIsLoopFinished = jest.fn(() => 'loop-finished-stop');
const mockStreamText = jest.fn();
const mockOpenAiChat = jest.fn(() => ({ id: 'mock-model' }));
const mockCreateOpenAI = jest.fn(() => ({ chat: mockOpenAiChat }));

jest.mock('ai', () => ({
  isLoopFinished: mockIsLoopFinished,
  streamText: mockStreamText,
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from '../../../src/runtime/host/runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from '../../../src/runtime/host/runtime-host-subagent-store.service';

describe('RuntimeHostSubagentRunnerService', () => {
  let storagePath: string;
  let sessionStoragePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    storagePath = path.join(os.tmpdir(), `gc-server-runner-${Date.now()}-${Math.random()}.json`);
    sessionStoragePath = path.join(os.tmpdir(), `gc-server-runner-session-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_SUBAGENTS_PATH = storagePath;
    process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH = sessionStoragePath;
    mockStreamText.mockReturnValue({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
          input: {
            query: 'coffee',
          },
          type: 'tool-call',
        };
        yield {
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
          output: {
            items: [{ id: 'memory-1' }],
          },
          type: 'tool-result',
        };
        yield {
          text: 'Done',
          type: 'text-delta',
        };
      })(),
    });
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SUBAGENTS_PATH;
    delete process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH;
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
    if (fs.existsSync(sessionStoragePath)) {
      fs.unlinkSync(sessionStoragePath);
    }
  });

  it('runs a real subagent stream with tool filter', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: 'search memory',
            name: 'memory.search',
            parameters: {
              query: {
                required: true,
                type: 'string',
              },
            },
          },
          {
            description: 'inspect web',
            name: 'web.search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });

    const conversationMessageService = new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService());
    const aiModelExecutionService = createAiModelExecutionService();
    const runner = new RuntimeHostSubagentRunnerService(
      aiModelExecutionService,
      conversationMessageService,
      {
        buildToolSet: jest.fn().mockResolvedValue({
          'memory.search': {},
        }),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );

    const result = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'summarize this conversation',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      toolNames: ['memory.search'],
    });
    expect(result).toEqual({
      finishReason: 'stop',
      message: {
        content: 'Done',
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      sessionId: expect.any(String),
      sessionMessageCount: 2,
      text: 'Done',
      toolCalls: [
        {
          input: {
            query: 'coffee',
          },
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
        },
      ],
      toolResults: [
        {
          output: {
            items: [{ id: 'memory-1' }],
          },
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
        },
      ],
    });

    expect(mockOpenAiChat).toHaveBeenCalledWith('gpt-5.4');
    expect(mockIsLoopFinished).toHaveBeenCalledTimes(1);
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      stopWhen: 'loop-finished-stop',
      tools: expect.objectContaining({
        'memory.search': expect.any(Object),
      }),
    }));
    expect(mockStreamText.mock.calls[0][0].tools).not.toHaveProperty('web.search');
  });

  it('runs remote subagent before/after hooks around the execution payload', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.hooker',
        name: 'Remote Hooker',
        runtime: 'remote',
      },
      governance: {
        defaultEnabled: true,
      },
      manifest: {
        hooks: [
          { name: 'subagent:before-run' },
          { name: 'subagent:after-run' },
        ],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const conversationMessageService = new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService());
    const aiModelExecutionService = createAiModelExecutionService();
    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeKernelService = {
      invokeHook: jest.fn().mockImplementation(async ({ hookName }) =>
        hookName === 'subagent:before-run'
          ? {
              action: 'mutate',
              messages: [
                {
                  content: 'mutated prompt',
                  role: 'user',
                },
              ],
              toolNames: ['memory.search'],
            }
          : {
              action: 'mutate',
              text: 'Hooked result',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      aiModelExecutionService,
      conversationMessageService,
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentStoreService(),
    );

    const hookedResult = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(hookedResult).toMatchObject({
      text: 'Hooked result',
    });

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledTimes(2);
    expect(runtimeKernelService.invokeHook.mock.calls[1][0].hookName).toBe('subagent:after-run');
    await expect(runtimeKernelService.invokeHook.mock.results[1].value).resolves.toEqual({
      action: 'mutate',
      text: 'Hooked result',
    });
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          content: 'mutated prompt',
          role: 'user',
        },
      ],
    }));
    expect(toolRegistryService.buildToolSet).toHaveBeenCalledWith(expect.objectContaining({
      allowedToolNames: ['memory.search'],
    }));
  });

  it('applies subagent type defaults to provider, system and tools', async () => {
    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue({
        webfetch: {},
        skill: {},
      }),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      toolRegistryService as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );

    await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'collect project context',
          role: 'user',
        },
      ],
      subagentType: 'explore',
    });

    expect(toolRegistryService.buildToolSet).toHaveBeenCalledWith(expect.objectContaining({
      allowedToolNames: ['webfetch', 'skill'],
    }));
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      system: expect.stringContaining('你是一个专注于探索与信息收集的子代理。'),
    }));
  });

  it('lets explicit request fields override subagent type defaults', async () => {
    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue({
        'memory.search': {},
      }),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      toolRegistryService as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );

    await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'collect project context',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      subagentType: 'explore',
      providerId: 'openai',
      system: '只检查 memory.search 工具',
      toolNames: ['memory.search'],
    });

    expect(toolRegistryService.buildToolSet).toHaveBeenCalledWith(expect.objectContaining({
      allowedToolNames: ['memory.search'],
    }));
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      system: '只检查 memory.search 工具',
    }));
    expect(mockStreamText.mock.calls.at(-1)?.[0]?.tools).not.toHaveProperty('webfetch');
  });

  it('reuses previous session request context when sessionId is provided', async () => {
    const subagentStore = new RuntimeHostSubagentStoreService();
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      description: '已有后台子代理',
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      pluginDisplayName: 'Memory Context',
      pluginId: 'builtin.memory-context',
      providerId: 'openai',
      subagentId: 'subagent-1',
      toolNames: ['memory.search'],
    });
    subagentStore.createSubagent({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      pluginDisplayName: 'Memory Context',
      pluginId: 'builtin.memory-context',
      request: {
        description: '已有后台子代理',
        messages: [
          {
            content: 'original prompt',
            role: 'user',
          },
        ],
        modelId: 'gpt-5.4',
        providerId: 'openai',
        toolNames: ['memory.search'],
      },
      requestPreview: 'original prompt',
      sessionId: 'subagent-session-1',
      sessionMessageCount: 1,
      sessionUpdatedAt: '2026-03-30T12:00:00.000Z',
      visibility: 'background',
      writeBackTarget: null,
    });
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue({
          'memory.search': {},
        }),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      subagentStore,
      sessionStore,
    );

    await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '继续已有后台子代理',
      messages: [
        {
          content: 'continue this task',
          role: 'user',
        },
      ],
      sessionId: 'subagent-session-1',
    });

    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
        {
          content: 'continue this task',
          role: 'user',
        },
      ],
      tools: expect.objectContaining({
        'memory.search': expect.any(Object),
      }),
    }));
  });

  it('creates a new background task record when an existing session resumes', async () => {
    const subagentStore = new RuntimeHostSubagentStoreService();
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      description: '已有后台子代理',
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
        {
          content: 'done',
          role: 'assistant',
        },
      ],
      modelId: 'gpt-5.4',
      pluginDisplayName: 'Memory Context',
      pluginId: 'builtin.memory-context',
      providerId: 'openai',
      subagentId: 'subagent-1',
    });
    subagentStore.createSubagent({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      pluginDisplayName: 'Memory Context',
      pluginId: 'builtin.memory-context',
      request: {
        description: '已有后台子代理',
        messages: [
          {
            content: 'original prompt',
            role: 'user',
          },
        ],
        modelId: 'gpt-5.4',
        providerId: 'openai',
      },
      requestPreview: 'original prompt',
      sessionId: 'subagent-session-1',
      sessionMessageCount: 1,
      sessionUpdatedAt: '2026-03-30T12:00:00.000Z',
      visibility: 'background',
      writeBackTarget: {
        id: 'conversation-1',
        type: 'conversation',
      },
    });
    subagentStore.updateSubagent('builtin.memory-context', 'subagent-1', (subagent, now) => {
      subagent.status = 'completed';
      subagent.finishedAt = now;
      subagent.result = {
        message: {
          content: 'done',
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: 'done',
        toolCalls: [],
        toolResults: [],
      };
      subagent.resultPreview = 'done';
      subagent.writeBackStatus = 'sent';
    });
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      subagentStore,
      sessionStore,
    );

    const summary = await runner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '继续已有后台子代理',
      messages: [
        {
          content: 'continue this task',
          role: 'user',
        },
      ],
      sessionId: 'subagent-session-1',
      writeBack: {
        target: {
          id: 'conversation-1',
          type: 'conversation',
        },
      },
    });

    expect(summary).toMatchObject({
      description: '继续已有后台子代理',
      requestPreview: 'continue this task',
      sessionId: 'subagent-session-1',
      sessionMessageCount: 3,
      status: 'queued',
      writeBackStatus: 'pending',
    });
    expect(subagentStore.getSubagent('builtin.memory-context', 'subagent-session-1')).toMatchObject({
      request: {
        description: '继续已有后台子代理',
        messages: [
          {
            content: 'original prompt',
            role: 'user',
          },
          {
            content: 'done',
            role: 'assistant',
          },
          {
            content: 'continue this task',
            role: 'user',
          },
        ],
      },
      status: 'queued',
    });
  });

  it('derives background task preview from text parts while keeping description separate', async () => {
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );

    const summary = await runner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '自动化烟测任务',
      messages: [
        {
          content: [
            {
              text: '请输出 smoke automation task',
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(summary).toMatchObject({
      description: '自动化烟测任务',
      requestPreview: '请输出 smoke automation task',
    });
  });

  it('persists subagent type summary on background tasks while keeping the raw request resumable', async () => {
    const subagentStore = new RuntimeHostSubagentStoreService();
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      subagentStore,
    );

    const summary = await runner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '探索任务',
      messages: [
        {
          content: '扫描仓库结构',
          role: 'user',
        },
      ],
      subagentType: 'explore',
    });

    expect(summary).toMatchObject({
      description: '探索任务',
      subagentType: 'explore',
      subagentTypeName: '探索',
    });
    expect(subagentStore.getSubagent('builtin.memory-context', (summary as { sessionId: string }).sessionId)).toMatchObject({
      subagentType: 'explore',
      subagentTypeName: '探索',
      request: {
        subagentType: 'explore',
      },
    });
  });

  it('runs builtin subagent hooks through the same hook chain', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.subagent-observer',
        name: 'Builtin Hooker',
        runtime: 'local',
      },
      governance: {
        defaultEnabled: true,
      },
      manifest: {
        hooks: [
          { name: 'subagent:before-run' },
          { name: 'subagent:after-run' },
        ],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeKernelService = {
      invokeHook: jest.fn().mockImplementation(async ({ hookName }) =>
        hookName === 'subagent:before-run'
          ? {
              action: 'mutate',
              messages: [
                {
                  content: 'builtin mutated prompt',
                  role: 'user',
                },
              ],
            }
          : {
              action: 'mutate',
              text: 'Builtin hooked result',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentStoreService(),
    );

    const result = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(result).toMatchObject({
      text: 'Builtin hooked result',
    });
    expect(runtimeKernelService.invokeHook).toHaveBeenCalledTimes(2);
    expect(runtimeKernelService.invokeHook.mock.calls[0][0]).toMatchObject({
      hookName: 'subagent:before-run',
      pluginId: 'builtin.subagent-observer',
    });
    expect(runtimeKernelService.invokeHook.mock.calls[1][0]).toMatchObject({
      hookName: 'subagent:after-run',
      pluginId: 'builtin.subagent-observer',
    });
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          content: 'builtin mutated prompt',
          role: 'user',
        },
      ],
    }));
  });

  it('collects tool-error parts as normalized tool results in subagent runs', async () => {
    mockStreamText.mockReturnValueOnce({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          error: 'request timeout',
          input: {
            city: 'Shanghai',
          },
          toolCallId: 'tool-call-error-1',
          toolName: 'weather.search',
          type: 'tool-error',
        };
        yield {
          text: '继续完成回复',
          type: 'text-delta',
        };
      })(),
    });

    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue({
          weather_search: {},
        }),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );

    const result = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: '先查天气再总结',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      toolNames: ['weather_search'],
    });

    expect(result).toEqual(expect.objectContaining({
      text: '继续完成回复',
      toolResults: [
        {
          output: {
            error: 'request timeout',
            inputText: JSON.stringify({
              city: 'Shanghai',
            }, null, 2),
            phase: 'execute',
            recovered: true,
            tool: 'weather.search',
            type: 'invalid-tool-result',
          },
          toolCallId: 'tool-call-error-1',
          toolName: 'weather.search',
        },
      ],
    }));
  });

  it('ignores hooks when the plugin is disabled for the current conversation scope', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.hooker',
        name: 'Remote Hooker',
        runtime: 'remote',
      },
      manifest: {
        hooks: [{ name: 'subagent:before-run' }],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      governance: { canDisable: true } as never,
      lastSeenAt: new Date().toISOString(),
      manifest: pluginBootstrapService.getPlugin('remote.hooker').manifest,
      pluginId: 'remote.hooker',
    });

    const runtimeKernelService = {
      invokeHook: jest.fn(),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentStoreService(),
    );
    (runner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(runtimeKernelService.invokeHook).not.toHaveBeenCalled();
  });

  it('resumes queued tasks after restart and completes them', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    originalRunner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume me',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingSubagents();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getSubagent('builtin.memory-context', 'subagent-session-1')).toMatchObject({
      result: {
        text: 'resume me',
      },
      status: 'completed',
    });
  });

  it('does not fabricate write-back success when the target conversation no longer exists after restart', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    await originalRunner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume write-back',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: 'conversation-1',
          type: 'conversation',
        },
      },
    });

    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingSubagents();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getSubagent('builtin.memory-context', 'subagent-session-1')).toMatchObject({
      status: 'completed',
      writeBackError: 'Conversation not found: conversation-1',
      writeBackStatus: 'failed',
    });
  });

  it('does not treat a recreated conversation with the same id as a valid write-back target after restart', async () => {
    const conversationEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
    const taskEnvKey = 'GARLIC_CLAW_SUBAGENTS_PATH';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const originalConversationPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.original-conversations.${suffix}.json`);
    const resumedConversationPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.resumed-conversations.${suffix}.json`);
    const taskPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.tasks.${suffix}.json`);
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    process.env[taskEnvKey] = taskPath;
    process.env[conversationEnvKey] = originalConversationPath;
    const originalConversationService = new RuntimeHostConversationRecordService();
    const originalConversationId = (originalConversationService.createConversation({
      title: 'Conversation conversation-1',
    }) as { id: string }).id;
    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(originalConversationService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    await originalRunner.startSubagent('builtin.memory-context', 'Memory Context', {
      conversationId: originalConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume recreated conversation',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: originalConversationId,
          type: 'conversation',
        },
      },
    });

    process.env[conversationEnvKey] = resumedConversationPath;
    const recreatedConversation = {
      ...originalConversationService.requireConversation(originalConversationId),
      revision: `${originalConversationId}:recreated:1`,
      revisionVersion: 1,
      updatedAt: '2026-04-14T00:00:00.000Z',
    };
    fs.writeFileSync(resumedConversationPath, JSON.stringify({
      conversations: {
        [originalConversationId]: recreatedConversation,
      },
    }, null, 2), 'utf-8');
    const resumedConversationService = new RuntimeHostConversationRecordService();
    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(resumedConversationService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingSubagents();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getSubagent('builtin.memory-context', 'subagent-session-1')).toMatchObject({
      status: 'completed',
      writeBackError: `Conversation revision changed: ${originalConversationId}`,
      writeBackStatus: 'failed',
    });
    delete process.env[conversationEnvKey];
    delete process.env[taskEnvKey];
    try {
      if (fs.existsSync(originalConversationPath)) {
        fs.unlinkSync(originalConversationPath);
      }
      if (fs.existsSync(resumedConversationPath)) {
        fs.unlinkSync(resumedConversationPath);
      }
      if (fs.existsSync(taskPath)) {
        fs.unlinkSync(taskPath);
      }
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });
});

function createAiModelExecutionService(): AiModelExecutionService {
  const aiProviderSettingsService = new AiProviderSettingsService();
  aiProviderSettingsService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });

  return new AiModelExecutionService(aiProviderSettingsService);
}
