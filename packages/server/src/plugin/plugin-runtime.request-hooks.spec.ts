import type { PluginManifest } from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService request hooks', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];
  let createTransport: PluginRuntimeSpecFixture['createTransport'];

  beforeEach(() => {
    ({
      service,
      builtinManifest,
      createTransport,
    } = createPluginRuntimeSpecFixture());
  });

  it('runs strong chat:before-model hooks sequentially and applies mutate/pass results', async () => {
    const mutatorManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.a-mutator',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const observerManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.b-observer',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const extraToolsManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.z-extra-tools',
      hooks: [],
      tools: [
        builtinManifest.tools[0],
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
    };
    const mutateHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      modelId: 'gpt-5.2-mini',
      systemPrompt: '你是一个更谨慎的助手',
      toolNames: ['recall_memory'],
      headers: {
        'x-router': 'enabled',
      },
    });
    const passHook = jest.fn().mockResolvedValue({
      action: 'pass',
    });

    await service.registerPlugin({
      manifest: mutatorManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: mutateHook,
      }),
    });
    await service.registerPlugin({
      manifest: observerManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: passHook,
      }),
    });
    await service.registerPlugin({
      manifest: extraToolsManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    const result = await service.runHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '今天我想喝咖啡',
            },
          ],
          availableTools: [
            {
              name: 'save_memory',
              description: '保存记忆',
              parameters: builtinManifest.tools[0].parameters,
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
            {
              name: 'recall_memory',
              description: '读取记忆',
              parameters: {
                query: {
                  type: 'string',
                  required: true,
                },
              },
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
          ],
        },
      } as never,
    });

    expect(mutateHook).toHaveBeenCalledWith({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: expect.objectContaining({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: expect.objectContaining({
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
        }),
      }),
    });
    expect(passHook).toHaveBeenCalledWith({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2-mini',
          systemPrompt: '你是一个更谨慎的助手',
          messages: [
            {
              role: 'user',
              content: '今天我想喝咖啡',
            },
          ],
          availableTools: [
            {
              name: 'recall_memory',
              description: '读取记忆',
              parameters: {
                query: {
                  type: 'string',
                  required: true,
                },
              },
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
          ],
          headers: {
            'x-router': 'enabled',
          },
        },
      },
    });
    expect(result).toEqual({
      action: 'continue',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2-mini',
        systemPrompt: '你是一个更谨慎的助手',
        messages: [
          {
            role: 'user',
            content: '今天我想喝咖啡',
          },
        ],
        availableTools: [
          {
            name: 'recall_memory',
            description: '读取记忆',
            parameters: {
              query: {
                type: 'string',
                required: true,
              },
            },
            pluginId: 'builtin.z-extra-tools',
            runtimeKind: 'builtin',
          },
        ],
        headers: {
          'x-router': 'enabled',
        },
      },
    });
  });

  it('short-circuits chat:before-model and skips later hooks', async () => {
    const shortCircuitManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.a-short-circuit',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const skippedManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.b-skipped',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      assistantContent: '这轮直接返回，不调用模型。',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: shortCircuitManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: skippedManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'chat:before-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [],
            availableTools: [],
          },
        },
      } as never),
    ).resolves.toEqual({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [],
        availableTools: [],
      },
      assistantContent: '这轮直接返回，不调用模型。',
      assistantParts: [
        {
          type: 'text',
          text: '这轮直接返回，不调用模型。',
        },
      ],
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(shortCircuitHook).toHaveBeenCalledTimes(1);
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('applies message:received filters and priority before later hooks observe the payload', async () => {
    const routerHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '/route 插件改写后的输入',
      parts: [
        {
          type: 'text',
          text: '/route 插件改写后的输入',
        },
      ],
      modelMessages: [
        {
          role: 'user',
          content: '/route 插件改写后的输入',
        },
      ],
    });
    const observerA = jest.fn().mockResolvedValue({
      action: 'pass',
    });
    const observerB = jest.fn().mockResolvedValue({
      action: 'pass',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.z-message-router',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: -10,
            filter: {
              message: {
                commands: ['/route'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: routerHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: 5,
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observerA,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: 5,
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observerB,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.image-only-listener',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            filter: {
              message: {
                messageKinds: ['image'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'message:received',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          message: {
            role: 'user',
            content: '/route 原始输入',
            parts: [
              {
                type: 'text',
                text: '/route 原始输入',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '/route 原始输入',
            },
          ],
        },
      }),
    ).resolves.toEqual({
      action: 'continue',
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        message: {
          role: 'user',
          content: '/route 插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '/route 插件改写后的输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 插件改写后的输入',
          },
        ],
      },
    });

    expect(observerA).toHaveBeenCalledWith({
      hookName: 'message:received',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        message: {
          role: 'user',
          content: '/route 插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '/route 插件改写后的输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 插件改写后的输入',
          },
        ],
      },
    });
    expect(observerA.mock.invocationCallOrder[0]).toBeLessThan(
      observerB.mock.invocationCallOrder[0],
    );
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('short-circuits message:received and skips later hooks', async () => {
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      assistantContent: '命令已由插件直接处理。',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-short-circuit',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            filter: {
              message: {
                commands: ['/route'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-skipped',
        tools: [],
        hooks: [
          {
            name: 'message:received',
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'message:received',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          message: {
            role: 'user',
            content: '/route 原始输入',
            parts: [
              {
                type: 'text',
                text: '/route 原始输入',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '/route 原始输入',
            },
          ],
        },
      }),
    ).resolves.toEqual({
      action: 'short-circuit',
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        message: {
          role: 'user',
          content: '/route 原始输入',
          parts: [
            {
              type: 'text',
              text: '/route 原始输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 原始输入',
          },
        ],
      },
      assistantContent: '命令已由插件直接处理。',
      assistantParts: [
        {
          type: 'text',
          text: '命令已由插件直接处理。',
        },
      ],
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(shortCircuitHook).toHaveBeenCalledTimes(1);
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('dispatches chat:waiting-model hooks without exposing a mutate contract', async () => {
    const waitingHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.waiting-observer',
        tools: [],
        hooks: [
          {
            name: 'chat:waiting-model',
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: waitingHook,
      }),
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'chat:waiting-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [
              {
                role: 'user',
                content: '今天喝什么',
              },
            ],
            availableTools: [],
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(waitingHook).toHaveBeenCalledWith({
      hookName: 'chat:waiting-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        conversationId: 'conversation-1',
        assistantMessageId: 'assistant-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '今天喝什么',
            },
          ],
          availableTools: [],
        },
      },
    });
  });
});
