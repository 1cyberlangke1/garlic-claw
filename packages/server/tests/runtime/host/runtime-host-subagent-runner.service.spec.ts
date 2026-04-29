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
import { ProjectSubagentTypeRegistryService } from '../../../src/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from '../../../src/runtime/host/runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from '../../../src/runtime/host/runtime-host-subagent-store.service';
import { createServerTestArtifactPath } from '../../../src/runtime/server-workspace-paths';

describe('RuntimeHostSubagentRunnerService', () => {
  let conversationsPath: string;
  let storagePath: string;
  let sessionStoragePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    storagePath = path.join(os.tmpdir(), `gc-server-runner-${Date.now()}-${Math.random()}.json`);
    sessionStoragePath = path.join(os.tmpdir(), `gc-server-runner-session-${Date.now()}-${Math.random()}.json`);
    conversationsPath = path.join(os.tmpdir(), `gc-server-runner-conversations-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_SUBAGENTS_PATH = storagePath;
    process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH = sessionStoragePath;
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
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
          text: '<subagent_result>\nDone\n</subagent_result>',
          type: 'text-delta',
        };
      })(),
    });
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SUBAGENTS_PATH;
    delete process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH;
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    for (const filePath of [storagePath, sessionStoragePath, conversationsPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it('runs a real subagent stream with tool filter', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory',
        name: 'Memory',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const result = await runner.runSubagent('builtin.memory', {
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
      text: '<subagent_result>\nDone\n</subagent_result>',
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
        id: 'builtin.memory',
        name: 'Memory',
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
              text: '<subagent_result>\nHooked result\n</subagent_result>',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      aiModelExecutionService,
      conversationMessageService,
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentStoreService(),
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const hookedResult = await runner.runSubagent('builtin.memory', {
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
      text: '<subagent_result>\nHooked result\n</subagent_result>',
    });

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledTimes(2);
    expect(runtimeKernelService.invokeHook.mock.calls[1][0].hookName).toBe('subagent:after-run');
    await expect(runtimeKernelService.invokeHook.mock.results[1].value).resolves.toEqual({
      action: 'mutate',
      text: '<subagent_result>\nHooked result\n</subagent_result>',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await runner.runSubagent('builtin.memory', {
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

  it('maps the default subagent type alias to general', async () => {
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const result = await runner.runSubagent('builtin.memory', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: '用默认子代理执行',
          role: 'user',
        },
      ],
      subagentType: 'default',
    });

    expect(result).toEqual(expect.objectContaining({
      sessionId: expect.any(String),
    }));
    expect(runner.listOverview().subagents).toEqual([
      expect.objectContaining({
        sessionId: (result as { sessionId: string }).sessionId,
        subagentType: 'general',
        visibility: 'inline',
      }),
    ]);
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await runner.runSubagent('builtin.memory', {
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

  it('rejects creating a new subagent session when the conversation has reached the configured limit', async () => {
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'session-1', role: 'user' }],
      pluginId: 'builtin.memory',
    });
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'session-2', role: 'user' }],
      pluginId: 'builtin.memory',
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
      new RuntimeHostSubagentStoreService(),
      sessionStore,
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await expect(runner.startSubagent('builtin.memory', 'Memory', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      maxConversationSubagents: 2,
      messages: [
        {
          content: 'new task',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).rejects.toThrow('当前会话最多允许 2 个 subagent 会话，已达到上限');
  });

  it('allows continuing an existing subagent session after the conversation reaches the configured limit', async () => {
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'original prompt', role: 'user' }],
      modelId: 'gpt-5.4',
      pluginId: 'builtin.memory',
      providerId: 'openai',
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
      new RuntimeHostSubagentStoreService(),
      sessionStore,
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await expect(runner.runSubagent('builtin.memory', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      maxConversationSubagents: 1,
      messages: [
        {
          content: 'continue task',
          role: 'user',
        },
      ],
      sessionId: 'subagent-session-1',
    })).resolves.toEqual(expect.objectContaining({
      sessionId: 'subagent-session-1',
    }));
  });

  it('treats an unknown session id as a new session instead of bypassing capacity checks', async () => {
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'existing prompt', role: 'user' }],
      pluginId: 'builtin.memory',
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
      new RuntimeHostSubagentStoreService(),
      sessionStore,
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await expect(runner.runSubagent('builtin.memory', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      maxConversationSubagents: 1,
      messages: [
        {
          content: 'continue task',
          role: 'user',
        },
      ],
      sessionId: 'chat-001',
    })).rejects.toThrow('当前会话最多允许 1 个 subagent 会话，已达到上限');
  });

  it('releases conversation capacity after a subagent session is removed', async () => {
    const subagentStore = new RuntimeHostSubagentStoreService();
    const sessionStore = new RuntimeHostSubagentSessionStoreService();
    const session = sessionStore.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'original task', role: 'user' }],
      pluginId: 'builtin.memory',
    });
    subagentStore.createSubagent({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      pluginDisplayName: 'Memory',
      pluginId: 'builtin.memory',
      request: {
        messages: [{ content: 'original task', role: 'user' }],
      },
      requestPreview: 'original task',
      sessionId: session.id,
      sessionMessageCount: 1,
      sessionUpdatedAt: session.updatedAt,
      visibility: 'background',
      writeBackTarget: null,
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
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await expect(runner.removeSubagentSession(session.id)).resolves.toBe(true);
    expect(runner.listOverview().subagents).toEqual([]);
    await expect(runner.runSubagent('builtin.memory', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      maxConversationSubagents: 1,
      messages: [
        {
          content: 'new task',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).resolves.toEqual(expect.objectContaining({
      sessionId: expect.any(String),
    }));
  });

  it('writes a removal notice to the main conversation and suppresses later write-back when a session is manually removed', async () => {
    const conversationRecordService = new RuntimeHostConversationRecordService();
    const conversationId = (conversationRecordService.createConversation({
      title: 'Main conversation',
      userId: 'user-1',
    }) as { id: string }).id;
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(conversationRecordService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const started = await runner.startSubagent('builtin.memory', 'Memory', {
      conversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: '后台继续执行',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: conversationId,
          type: 'conversation',
        },
      },
    });

    await expect(runner.removeSubagentSession((started as { sessionId: string }).sessionId)).resolves.toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(conversationRecordService.requireConversation(conversationId, 'user-1').messages).toEqual([
      expect.objectContaining({
        content: '子代理已被手动移除，后续结果不会再回写到主会话。',
        role: 'assistant',
        status: 'completed',
      }),
    ]);
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
      pluginDisplayName: 'Memory',
      pluginId: 'builtin.memory',
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
      pluginDisplayName: 'Memory',
      pluginId: 'builtin.memory',
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
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    await runner.runSubagent('builtin.memory', {
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
      pluginDisplayName: 'Memory',
      pluginId: 'builtin.memory',
      providerId: 'openai',
      subagentId: 'subagent-1',
    });
    subagentStore.createSubagent({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      pluginDisplayName: 'Memory',
      pluginId: 'builtin.memory',
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
    subagentStore.updateSubagent('builtin.memory', 'subagent-1', (subagent, now) => {
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
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const summary = await runner.startSubagent('builtin.memory', 'Memory', {
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
    expect(subagentStore.getSubagent('builtin.memory', 'subagent-session-1')).toMatchObject({
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const summary = await runner.startSubagent('builtin.memory', 'Memory', {
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const summary = await runner.startSubagent('builtin.memory', 'Memory', {
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
    expect(subagentStore.getSubagent('builtin.memory', (summary as { sessionId: string }).sessionId)).toMatchObject({
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
        id: 'builtin.memory',
        name: 'Memory',
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
              text: '<subagent_result>\nBuiltin hooked result\n</subagent_result>',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentStoreService(),
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const result = await runner.runSubagent('builtin.memory', {
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
      text: '<subagent_result>\nBuiltin hooked result\n</subagent_result>',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );

    const result = await runner.runSubagent('builtin.memory', {
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
      text: expect.stringContaining('继续完成回复'),
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
        id: 'builtin.memory',
        name: 'Memory',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
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

    await runner.runSubagent('builtin.memory', {
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
        id: 'builtin.memory',
        name: 'Memory',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );
    originalRunner.startSubagent('builtin.memory', 'Memory', {
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
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

    expect(resumedRunner.getSubagent('builtin.memory', 'subagent-session-1')).toMatchObject({
      result: {
        text: 'resume me',
      },
      status: 'completed',
    });
  });

  it('writes subagent execution errors back to the main conversation when writeBack is enabled', async () => {
    const conversationRecordService = new RuntimeHostConversationRecordService();
    const conversationId = (conversationRecordService.createConversation({
      title: 'Main conversation',
      userId: 'user-1',
    }) as { id: string }).id;
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(conversationRecordService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      new RuntimeHostSubagentStoreService(),
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );
    Reflect.set(runner as object, 'executeSubagent', async () => {
      throw new Error('OpenAI 429');
    });

    const summary = await runner.startSubagent('builtin.memory', 'Memory', {
      conversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: '后台继续执行',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: conversationId,
          type: 'conversation',
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runner.getSubagent('builtin.memory', (summary as { sessionId: string }).sessionId)).toMatchObject({
      error: 'OpenAI 429',
      status: 'error',
      writeBackStatus: 'sent',
    });
    expect(conversationRecordService.requireConversation(conversationId, 'user-1').messages).toEqual([
      expect.objectContaining({
        content: '子代理执行失败：OpenAI 429',
        role: 'assistant',
        status: 'completed',
      }),
    ]);
  });

  it('does not fabricate write-back success when the target conversation no longer exists after restart', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory',
        name: 'Memory',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );
    await originalRunner.startSubagent('builtin.memory', 'Memory', {
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
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

    expect(resumedRunner.getSubagent('builtin.memory', 'subagent-session-1')).toMatchObject({
      status: 'completed',
      writeBackError: 'Conversation not found: conversation-1',
      writeBackStatus: 'failed',
    });
  });

  it('does not treat a recreated conversation with the same id as a valid write-back target after restart', async () => {
    const conversationEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
    const taskEnvKey = 'GARLIC_CLAW_SUBAGENTS_PATH';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const originalConversationPath = createServerTestArtifactPath({ extension: '.json', prefix: `runtime-host-subagent-runner.original-conversations.${suffix}`, subdirectory: 'server' });
    const resumedConversationPath = createServerTestArtifactPath({ extension: '.json', prefix: `runtime-host-subagent-runner.resumed-conversations.${suffix}`, subdirectory: 'server' });
    const taskPath = createServerTestArtifactPath({ extension: '.json', prefix: `runtime-host-subagent-runner.tasks.${suffix}`, subdirectory: 'server' });
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory',
        name: 'Memory',
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    );
    await originalRunner.startSubagent('builtin.memory', 'Memory', {
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
      new RuntimeHostSubagentSessionStoreService(),
      new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
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

    expect(resumedRunner.getSubagent('builtin.memory', 'subagent-session-1')).toMatchObject({
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
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });

  return new AiModelExecutionService(aiProviderSettingsService);
}
