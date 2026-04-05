import type { PluginManifest } from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService subagent flow', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let aiModelExecution: PluginRuntimeSpecFixture['aiModelExecution'];
  let toolRegistry: PluginRuntimeSpecFixture['toolRegistry'];
  let subagentTaskService: PluginRuntimeSpecFixture['subagentTaskService'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];
  let createTransport: PluginRuntimeSpecFixture['createTransport'];

  beforeEach(() => {
    ({
      service,
      aiModelExecution,
      toolRegistry,
      subagentTaskService,
      builtinManifest,
      createTransport,
    } = createPluginRuntimeSpecFixture());
  });

  it('enforces subagent permission before subagent host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.subagent-delegate',
      permissions: ['config:read'],
      tools: [],
      hooks: [],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'subagent.run' as never,
        params: {
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
        },
      }),
    ).rejects.toThrow('插件 builtin.subagent-delegate 缺少权限 subagent:run');
  });

  it('delegates background subagent task host calls through the task service', async () => {
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-delegate',
        name: '子代理委派',
        permissions: ['subagent:run'],
        tools: [],
        hooks: [],
      },
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    subagentTaskService.listTasksForPlugin.mockResolvedValueOnce([
      {
        id: 'subagent-task-1',
        pluginId: 'builtin.subagent-delegate',
        pluginDisplayName: '子代理委派',
        runtimeKind: 'builtin',
        status: 'queued',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: null,
        finishedAt: null,
      },
    ]);
    subagentTaskService.getTaskForPlugin.mockResolvedValueOnce({
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台任务总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'sent',
      writeBackMessageId: 'assistant-message-1',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台任务总结',
        message: {
          role: 'assistant',
          content: '这是后台任务总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'subagent.task.start' as never,
        params: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messages: [
            {
              role: 'user',
              content: '请帮我总结当前对话',
            },
          ],
          maxSteps: 4,
          writeBack: {
            target: {
              type: 'conversation',
              id: 'conversation-1',
            },
          },
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        status: 'queued',
        writeBackStatus: 'pending',
      }),
    );

    expect(subagentTaskService.startTask).toHaveBeenCalledWith({
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      writeBackTarget: {
        type: 'conversation',
        id: 'conversation-1',
      },
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'subagent.task.list' as never,
        params: {},
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'subagent-task-1',
        status: 'queued',
      }),
    ]);

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'subagent.task.get' as never,
        params: {
          taskId: 'subagent-task-1',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        status: 'completed',
        result: expect.objectContaining({
          text: '这是后台任务总结',
        }),
      }),
    );

    expect(subagentTaskService.listTasksForPlugin).toHaveBeenCalledWith(
      'builtin.subagent-delegate',
    );
    expect(subagentTaskService.getTaskForPlugin).toHaveBeenCalledWith(
      'builtin.subagent-delegate',
      'subagent-task-1',
    );
  });

  it('runs subagent calls through a tool loop with filtered visible tools', async () => {
    const callerManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.subagent-delegate',
      permissions: ['subagent:run'],
      tools: [
        {
          name: 'delegate_summary',
          description: '委托子代理总结',
          parameters: {
            prompt: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    };
    const memoryManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.memory-tools',
      permissions: ['memory:read'],
      tools: [
        {
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    };
    const memoryToolTransport = createTransport({
      executeTool: jest.fn().mockResolvedValue({
        count: 1,
        memories: [
          {
            content: '用户喜欢咖啡',
          },
        ],
      }),
    });
    const recallMemoryTool = {
      description: '读取记忆',
      inputSchema: undefined,
      execute: jest.fn().mockImplementation((params) =>
        memoryToolTransport.executeTool({
          toolName: 'recall_memory',
          params,
          context: {
            source: 'subagent',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
            activePersonaId: 'builtin.default-assistant',
          },
        })),
    };
    toolRegistry.buildToolSet.mockResolvedValue({
      recall_memory: recallMemoryTool,
    });
    aiModelExecution.prepareResolved.mockReturnValue({
      modelConfig: {
        id: 'gpt-5.2',
        providerId: 'openai',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      },
      model: {
        provider: 'openai',
        modelId: 'gpt-5.2',
      },
      sdkMessages: [],
    });
    aiModelExecution.streamPrepared.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            input: {
              query: '咖啡',
            },
          } as const;
          yield {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            output: {
              count: 1,
            },
          } as const;
          yield {
            type: 'text-delta',
            text: '已完成总结',
          } as const;
          yield { type: 'finish' } as const;
        })(),
        finishReason: Promise.resolve('stop'),
      },
    });

    await service.registerPlugin({
      manifest: callerManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });
    await service.registerPlugin({
      manifest: memoryManifest,
      runtimeKind: 'builtin',
      transport: memoryToolTransport,
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        method: 'subagent.run' as never,
        params: {
          messages: [
            {
              role: 'user',
              content: '请结合记忆帮我总结',
            },
          ],
          toolNames: ['recall_memory'],
          maxSteps: 4,
        },
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: '已完成总结',
      message: {
        role: 'assistant',
        content: '已完成总结',
      },
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          input: {
            query: '咖啡',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          output: {
            count: 1,
          },
        },
      ],
    });

    expect(Object.keys(aiModelExecution.streamPrepared.mock.calls[0][0].tools)).toEqual([
      'recall_memory',
    ]);

    await aiModelExecution.streamPrepared.mock.calls[0][0].tools.recall_memory.execute({
      query: '咖啡',
    });

    expect(memoryToolTransport.executeTool).toHaveBeenCalledWith({
      toolName: 'recall_memory',
      params: {
        query: '咖啡',
      },
      context: {
        source: 'subagent',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
    });
  });

  it('runs subagent lifecycle hooks around subagent.run and applies their mutations', async () => {
    const beforeHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      system: '你是更谨慎的子代理',
      toolNames: ['recall_memory'],
      maxSteps: 2,
    });
    const afterHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      text: '已被 after hook 改写',
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          output: {
            count: 2,
          },
        },
      ],
    });

    aiModelExecution.resolveModelConfig.mockReturnValue({
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
    });
    aiModelExecution.prepareResolved.mockReturnValue({
      modelConfig: {
        id: 'claude-3-7-sonnet',
        providerId: 'anthropic',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      },
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      },
      sdkMessages: [],
    });
    aiModelExecution.streamPrepared.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            input: {
              query: '咖啡',
            },
          } as const;
          yield {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            output: {
              count: 1,
            },
          } as const;
          yield {
            type: 'text-delta',
            text: '原始子代理回复',
          } as const;
          yield { type: 'finish' } as const;
        })(),
        finishReason: Promise.resolve('stop'),
      },
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-observer',
        tools: [],
        hooks: [
          {
            name: 'subagent:before-run',
          },
          {
            name: 'subagent:after-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: jest.fn()
          .mockImplementationOnce(beforeHook)
          .mockImplementationOnce(afterHook),
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-delegate',
        permissions: ['subagent:run'],
        tools: [],
        hooks: [],
      },
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        method: 'subagent.run' as never,
        params: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          maxSteps: 4,
        },
      }),
    ).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: '已被 after hook 改写',
      message: {
        role: 'assistant',
        content: '已被 after hook 改写',
      },
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          input: {
            query: '咖啡',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          output: {
            count: 2,
          },
        },
      ],
    });

    expect(beforeHook).toHaveBeenCalledWith({
      hookName: 'subagent:before-run',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        pluginId: 'builtin.subagent-delegate',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          maxSteps: 4,
        },
      },
    });
    expect(afterHook).toHaveBeenCalledWith({
      hookName: 'subagent:after-run',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        pluginId: 'builtin.subagent-delegate',
        request: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          system: '你是更谨慎的子代理',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          toolNames: ['recall_memory'],
          maxSteps: 2,
        },
        result: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          text: '原始子代理回复',
          message: {
            role: 'assistant',
            content: '原始子代理回复',
          },
          finishReason: 'stop',
          toolCalls: [
            {
              toolCallId: 'call-1',
              toolName: 'recall_memory',
              input: {
                query: '咖啡',
              },
            },
          ],
          toolResults: [
            {
              toolCallId: 'call-1',
              toolName: 'recall_memory',
              output: {
                count: 1,
              },
            },
          ],
        },
      },
    });
    expect(aiModelExecution.resolveModelConfig).toHaveBeenCalledWith(
      'anthropic',
      'claude-3-7-sonnet',
    );
    expect(aiModelExecution.streamPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        system: '你是更谨慎的子代理',
        stopWhen: expect.anything(),
      }),
    );
  });

  it('builds subagent-visible tools through ToolRegistryService instead of the previous plugin helper path', async () => {
    const recallMemoryTool = {
      description: '读取记忆',
      inputSchema: undefined,
      execute: jest.fn().mockResolvedValue({
        count: 1,
      }),
    };

    toolRegistry.buildToolSet.mockResolvedValue({
      recall_memory: recallMemoryTool,
    });
    aiModelExecution.prepareResolved.mockReturnValue({
      modelConfig: {
        id: 'gpt-5.2',
        providerId: 'openai',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      },
      model: {
        provider: 'openai',
        modelId: 'gpt-5.2',
      },
      sdkMessages: [],
    });
    aiModelExecution.streamPrepared.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            input: {
              query: '咖啡',
            },
          } as const;
          yield {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            output: {
              count: 1,
            },
          } as const;
          yield {
            type: 'text-delta',
            text: '已完成总结',
          } as const;
          yield { type: 'finish' } as const;
        })(),
        finishReason: Promise.resolve('stop'),
      },
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-delegate',
        permissions: ['subagent:run'],
        tools: [
          {
            name: 'delegate_work',
            description: '委派工作',
            parameters: {},
          },
        ],
        hooks: [],
      },
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await service.callHost({
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'subagent.run' as never,
      params: {
        messages: [
          {
            role: 'user',
            content: '请结合工具帮我总结',
          },
        ],
        toolNames: ['recall_memory'],
      },
    });

    expect(toolRegistry.buildToolSet).toHaveBeenCalledWith({
      context: {
        source: 'subagent',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      allowedToolNames: ['recall_memory'],
      excludedSources: [
        {
          kind: 'plugin',
          id: 'builtin.subagent-delegate',
        },
      ],
    });

    expect(aiModelExecution.streamPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          recall_memory: recallMemoryTool,
        },
      }),
    );
  });
});
