import type {
  ChatAfterModelHookPayload,
  PluginManifest,
} from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService result hooks', () => {
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

  it('dispatches chat:after-model hooks for completed assistant responses', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.conversation-title',
      permissions: ['conversation:read', 'conversation:write', 'llm:generate'],
      hooks: [
        {
          name: 'chat:after-model',
        },
      ],
    };
    const invokeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'chat:after-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantMessageId: 'assistant-1',
          assistantContent: '我已经帮你总结好了。',
          assistantParts: [
            {
              type: 'text',
              text: '我已经帮你总结好了。',
            },
          ],
          toolCalls: [],
          toolResults: [],
        } satisfies ChatAfterModelHookPayload,
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantMessageId: 'assistant-1',
      assistantContent: '我已经帮你总结好了。',
      assistantParts: [
        {
          type: 'text',
          text: '我已经帮你总结好了。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'chat:after-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '我已经帮你总结好了。',
        assistantParts: [
          {
            type: 'text',
            text: '我已经帮你总结好了。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('applies chat:after-model assistant content mutations in sequence', async () => {
    const rewriteHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      assistantContent: '这是插件润色后的最终回复。',
    });
    const observeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-rewrite-after-model',
        tools: [],
        hooks: [
          {
            name: 'chat:after-model',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: rewriteHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-observe-after-model',
        tools: [],
        hooks: [
          {
            name: 'chat:after-model',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observeHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'chat:after-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantMessageId: 'assistant-1',
          assistantContent: '原始回复。',
          assistantParts: [
            {
              type: 'text',
              text: '原始回复。',
            },
          ],
          toolCalls: [],
          toolResults: [],
        } satisfies ChatAfterModelHookPayload,
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantMessageId: 'assistant-1',
      assistantContent: '这是插件润色后的最终回复。',
      assistantParts: [
        {
          type: 'text',
          text: '原始回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    expect(observeHook).toHaveBeenCalledWith({
      hookName: 'chat:after-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '这是插件润色后的最终回复。',
        assistantParts: [
          {
            type: 'text',
            text: '原始回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('dispatches conversation:created hooks after a conversation is created', async () => {
    const invokeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.conversation-observer',
        tools: [],
        hooks: [
          {
            name: 'conversation:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'conversation:created',
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'http-route',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          conversation: {
            id: 'conversation-1',
            title: '新的对话',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'conversation:created',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversation: {
          id: 'conversation-1',
          title: '新的对话',
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
      },
    });
  });

  it('applies message:created mutations in sequence', async () => {
    const rewriteHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      content: '插件改写后的输入',
      parts: [
        {
          type: 'text',
          text: '插件改写后的输入',
        },
      ],
      modelMessages: [
        {
          role: 'user',
          content: '插件改写后的输入',
        },
      ],
    });
    const observeHook = jest.fn().mockResolvedValue({
      action: 'pass',
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-rewriter',
        tools: [],
        hooks: [
          {
            name: 'message:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: rewriteHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observeHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'message:created',
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
          message: {
            role: 'user',
            content: '原始输入',
            parts: [
              {
                type: 'text',
                text: '原始输入',
              },
            ],
            status: 'completed',
          },
          modelMessages: [
            {
              role: 'user',
              content: '原始输入',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '插件改写后的输入',
        parts: [
          {
            type: 'text',
            text: '插件改写后的输入',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: '插件改写后的输入',
        },
      ],
    });

    expect(observeHook).toHaveBeenCalledWith({
      hookName: 'message:created',
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
        message: {
          role: 'user',
          content: '插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '插件改写后的输入',
            },
          ],
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'user',
            content: '插件改写后的输入',
          },
        ],
      },
    });
  });

  it('supports automation:before-run short-circuit and applies automation:after-run mutations', async () => {
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
      ],
    });
    const afterRunHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
        {
          action: 'summary',
          result: '插件补充了摘要',
        },
      ],
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-automation-short-circuit',
        tools: [],
        hooks: [
          {
            name: 'automation:before-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-automation-after-run',
        tools: [],
        hooks: [
          {
            name: 'automation:after-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: afterRunHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'automation:before-run',
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
            name: '测试自动化',
            trigger: {
              type: 'manual',
            },
            actions: [],
            enabled: true,
            lastRunAt: null,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
          actions: [],
        },
      } as never),
    ).resolves.toEqual({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
      ],
    });

    await expect(
      service.runHook({
        hookName: 'automation:after-run',
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
            name: '测试自动化',
            trigger: {
              type: 'manual',
            },
            actions: [],
            enabled: true,
            lastRunAt: null,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
          status: 'success',
          results: [
            {
              action: 'hook',
              result: '直接完成',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      automation: {
        id: 'automation-1',
        name: '测试自动化',
        trigger: {
          type: 'manual',
        },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
        {
          action: 'summary',
          result: '插件补充了摘要',
        },
      ],
    });
  });

  it('applies response:before-send mutations and dispatches response:after-send hooks', async () => {
    const beforeSendHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      assistantContent: '发送前统一包装后的回复',
      assistantParts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复',
        },
      ],
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    const afterSendHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-response-before-send',
        tools: [],
        hooks: [
          {
            name: 'response:before-send',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: beforeSendHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-response-after-send',
        tools: [],
        hooks: [
          {
            name: 'response:after-send',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: afterSendHook,
      }),
    });

    await expect(
      service.runHook({
        hookName: 'response:before-send',
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
          responseSource: 'model',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantContent: '原始最终回复',
          assistantParts: [
            {
              type: 'text',
              text: '原始最终回复',
            },
          ],
          toolCalls: [],
          toolResults: [],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      responseSource: 'model',
      assistantMessageId: 'assistant-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: '发送前统一包装后的回复',
      assistantParts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'response:after-send',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'anthropic',
            activeModelId: 'claude-3-7-sonnet',
          },
          responseSource: 'model',
          assistantMessageId: 'assistant-1',
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          assistantContent: '发送前统一包装后的回复',
          assistantParts: [
            {
              type: 'image',
              image: 'https://example.com/final.png',
            },
            {
              type: 'text',
              text: '发送前统一包装后的回复',
            },
          ],
          toolCalls: [],
          toolResults: [],
          sentAt: '2026-03-28T18:30:00.000Z',
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(afterSendHook).toHaveBeenCalledWith({
      hookName: 'response:after-send',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
        },
        responseSource: 'model',
        assistantMessageId: 'assistant-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantContent: '发送前统一包装后的回复',
        assistantParts: [
          {
            type: 'image',
            image: 'https://example.com/final.png',
          },
          {
            type: 'text',
            text: '发送前统一包装后的回复',
          },
        ],
        toolCalls: [],
        toolResults: [],
        sentAt: '2026-03-28T18:30:00.000Z',
      },
    });
  });

});
