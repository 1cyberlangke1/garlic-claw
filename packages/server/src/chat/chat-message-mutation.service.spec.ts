import { ChatMessageMutationService } from './chat-message-mutation.service';

describe('ChatMessageMutationService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const runMessageCreatedHooks = jest.fn();
  const runMessageUpdatedHooks = jest.fn();
  const runMessageDeletedHooks = jest.fn();
  const pluginRuntime = {
    runMessageCreatedHooks,
    runMessageUpdatedHooks,
    runMessageDeletedHooks,
    runHook: jest.fn(async ({ hookName, ...input }: { hookName: string }) =>
      hookName === 'message:created'
        ? runMessageCreatedHooks(input)
        : runMessageUpdatedHooks(input)),
    runBroadcastHook: jest.fn(async ({ hookName, ...input }: { hookName: string }) =>
      runMessageDeletedHooks(input)),
  };

  const chatTaskService = {
    stopTask: jest.fn(),
  };

  const orchestration = {
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  let service: ChatMessageMutationService;

  beforeEach(() => {
    jest.clearAllMocks();
    runMessageCreatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageUpdatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageDeletedHooks.mockResolvedValue(undefined);
    orchestration.applyFinalResponseHooks.mockImplementation(
      async ({ result }: { result: unknown }) => result,
    );
    orchestration.runResponseAfterSendHooks.mockResolvedValue(undefined);
    chatTaskService.stopTask.mockResolvedValue(false);
    prisma.conversation.update.mockResolvedValue(null);
    service = new ChatMessageMutationService(
      prisma as never,
      chatService as never,
      pluginRuntime as never,
      orchestration as never,
      chatTaskService as never,
    );
  });

  it('startGenerationTurn persists a hook-mutated user message and pending assistant', async () => {
    runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'chat',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '插件改写后的用户消息',
        parts: [
          {
            type: 'text',
            text: '插件改写后的用户消息',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '插件改写后的用户消息',
            },
          ],
        },
      ],
    });
    prisma.message.create
      .mockResolvedValueOnce({
        id: 'user-message-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: '插件改写后的用户消息',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的用户消息',
          },
        ]),
        status: 'completed',
      })
      .mockResolvedValueOnce({
        id: 'assistant-message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        partsJson: null,
        provider: 'openai',
        model: 'gpt-5.2',
        status: 'pending',
      });

    await expect(
      service.startGenerationTurn({
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'persona-1',
        modelConfig: {
          providerId: 'openai',
          id: 'gpt-5.2',
        },
        receivedMessagePayload: {
          message: {
            content: '原始用户消息',
            parts: [
              {
                type: 'text',
                text: '原始用户消息',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '原始用户消息',
                },
              ],
            },
          ],
        },
      }),
    ).resolves.toEqual({
      userMessage: expect.objectContaining({
        id: 'user-message-1',
        content: '插件改写后的用户消息',
      }),
      assistantMessage: expect.objectContaining({
        id: 'assistant-message-1',
        status: 'pending',
      }),
      modelMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '插件改写后的用户消息',
            },
          ],
        },
      ],
    });

    expect(prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conversation-1',
        role: 'user',
        content: '插件改写后的用户消息',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的用户消息',
          },
        ]),
        status: 'completed',
      },
    });
    expect(prisma.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        provider: 'openai',
        model: 'gpt-5.2',
        status: 'pending',
      },
    });
  });

  it('createHookedStoredMessage persists a hook-mutated assistant message', async () => {
    runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'assistant',
        content: '插件改写后的回复',
        parts: [
          {
            type: 'text',
            text: '插件改写后的回复',
          },
        ],
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '插件改写后的回复',
            },
          ],
        },
      ],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-created-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '插件改写后的回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件改写后的回复',
        },
      ]),
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
    });
    const createHookedStoredMessage = (
      service as unknown as {
        createHookedStoredMessage: (input: unknown) => Promise<unknown>;
      }
    ).createHookedStoredMessage.bind(service);

    await expect(
      createHookedStoredMessage({
        conversationId: 'conversation-1',
        hookContext: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'plugin-provider',
          activeModelId: 'plugin-model',
          activePersonaId: 'persona-1',
        },
        modelMessages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '原始回复',
              },
            ],
          },
        ],
        message: {
          role: 'assistant',
          content: '原始回复',
          parts: [
            {
              type: 'text',
              text: '原始回复',
            },
          ],
          provider: 'plugin-provider',
          model: 'plugin-model',
          status: 'completed',
        },
      }),
    ).resolves.toEqual({
      createdMessage: expect.objectContaining({
        id: 'assistant-message-created-1',
        content: '插件改写后的回复',
      }),
      modelMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '插件改写后的回复',
            },
          ],
        },
      ],
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '插件改写后的回复',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的回复',
          },
        ]),
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
    });
  });

  it('sendPluginMessage returns the persisted assistant view after message:created mutates message.send output', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      title: '当前会话',
      messages: [],
    });
    runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'hook-provider',
        activeModelId: 'hook-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'assistant',
        content: 'hook 改写后的回复',
        parts: [
          {
            type: 'text',
            text: 'hook 改写后的回复',
          },
        ],
        provider: 'hook-provider',
        model: 'hook-model',
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'hook 改写后的回复',
            },
          ],
        },
      ],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-send-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: 'hook 改写后的回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: 'hook 改写后的回复',
        },
      ]),
      provider: 'hook-provider',
      model: 'hook-model',
      status: 'completed',
      createdAt: new Date('2026-04-04T08:00:00.000Z'),
      updatedAt: new Date('2026-04-04T08:00:01.000Z'),
    });

    await expect(
      service.sendPluginMessage({
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'call-provider',
          activeModelId: 'call-model',
          activePersonaId: 'persona-1',
        },
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
        content: '原始回复',
        provider: 'call-provider',
        model: 'call-model',
      }),
    ).resolves.toEqual({
      target: {
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      },
      id: 'assistant-message-send-1',
      role: 'assistant',
      content: 'hook 改写后的回复',
      parts: [
        {
          type: 'text',
          text: 'hook 改写后的回复',
        },
      ],
      provider: 'hook-provider',
      model: 'hook-model',
      status: 'completed',
      createdAt: '2026-04-04T08:00:00.000Z',
      updatedAt: '2026-04-04T08:00:01.000Z',
    });
  });

  it('returns the current conversation as the current plugin message target', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      title: '当前会话',
      messages: [],
    });

    await expect(
      service.getCurrentPluginMessageTarget({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      type: 'conversation',
      id: 'conversation-1',
      label: '当前会话',
    });

    expect(chatService.getConversation).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
    );
  });

  it('sends a plugin message through the generic message target interface', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-2',
      title: 'Plugin Target',
      messages: [],
    });
    runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-2',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-2',
      message: {
        role: 'assistant',
        content: '插件补充回复',
        parts: [
          {
            type: 'text',
            text: '插件补充回复',
          },
        ],
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '插件补充回复',
            },
          ],
        },
      ],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-plugin-1',
      conversationId: 'conversation-2',
      role: 'assistant',
      content: '插件补充回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件补充回复',
        },
      ]),
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });

    await expect(
      service.sendPluginMessage({
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'persona-1',
        },
        target: {
          type: 'conversation',
          id: 'conversation-2',
        },
        content: '插件补充回复',
        provider: 'plugin-provider',
        model: 'plugin-model',
      }),
    ).resolves.toEqual({
      id: 'assistant-message-plugin-1',
      target: {
        type: 'conversation',
        id: 'conversation-2',
        label: 'Plugin Target',
      },
      role: 'assistant',
      content: '插件补充回复',
      parts: [
        {
          type: 'text',
          text: '插件补充回复',
        },
      ],
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
    });

    expect(chatService.getConversation).toHaveBeenCalledWith(
      'user-1',
      'conversation-2',
    );
  });

  it('writes a short-circuited assistant reply, applies final hooks, and emits after-send hooks', async () => {
    prisma.message.update.mockResolvedValue({
      id: 'assistant-message-1',
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ]),
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    });
    orchestration.applyFinalResponseHooks.mockResolvedValue({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '发送前统一包装后的回复。',
      parts: [
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    await expect(
      service.completeShortCircuitedAssistant({
        assistantMessageId: 'assistant-message-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
        completion: {
          assistantContent: '插件已经直接回复。',
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      }),
    ).resolves.toEqual({
      id: 'assistant-message-1',
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ]),
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    });

    expect(orchestration.applyFinalResponseHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: '插件已经直接回复。',
        parts: [
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(orchestration.runResponseAfterSendHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: '发送前统一包装后的回复。',
        parts: [
          {
            type: 'text',
            text: '发送前统一包装后的回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('writes vision fallback metadata onto the current user and assistant messages', async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.applyVisionFallbackMetadata({
        userMessage: {
          id: 'user-message-1',
          metadataJson: null,
        },
        assistantMessage: {
          id: 'assistant-message-1',
          metadataJson: null,
        },
        visionFallbackEntries: [
          {
            text: '图片里是一只趴着的橘猫。',
            source: 'generated',
          },
        ],
      }),
    ).resolves.toEqual({
      userMessage: {
        id: 'user-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
      assistantMessage: {
        id: 'assistant-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
    });

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['user-message-1', 'assistant-message-1'],
        },
      },
      data: {
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
    });
  });

  it('writes vision fallback metadata onto the retried assistant message only', async () => {
    prisma.message.update.mockResolvedValue({
      id: 'assistant-message-2',
      metadataJson: JSON.stringify({
        visionFallback: {
          state: 'completed',
          entries: [
            {
              text: '一只戴围巾的柴犬。',
              source: 'cache',
            },
          ],
        },
      }),
    });

    await expect(
      service.applyVisionFallbackMetadata({
        assistantMessage: {
          id: 'assistant-message-2',
          metadataJson: null,
        },
        visionFallbackEntries: [
          {
            text: '一只戴围巾的柴犬。',
            source: 'cache',
          },
        ],
      }),
    ).resolves.toEqual({
      userMessage: null,
      assistantMessage: {
        id: 'assistant-message-2',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '一只戴围巾的柴犬。',
                source: 'cache',
              },
            ],
          },
        }),
      },
    });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: {
        id: 'assistant-message-2',
      },
      data: {
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '一只戴围巾的柴犬。',
                source: 'cache',
              },
            ],
          },
        }),
      },
    });
  });

  it('applies message:updated hooks before persisting a user message edit', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          partsJson: JSON.stringify([
            {
              type: 'text',
              text: '旧内容',
            },
          ]),
          status: 'completed',
        },
      ],
    });
    pluginRuntime.runMessageUpdatedHooks.mockResolvedValue({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'user',
        content: '旧内容',
        parts: [
          {
            type: 'text',
            text: '旧内容',
          },
        ],
        status: 'completed',
      },
      nextMessage: {
        role: 'user',
        content: '插件改写后的新内容',
        parts: [
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ],
        status: 'completed',
      },
    });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      role: 'user',
      content: '插件改写后的新内容',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件改写后的新内容',
        },
      ]),
      status: 'completed',
    });

    await service.updateMessage('user-1', 'conversation-1', 'message-1', {
      content: '用户输入的新内容',
      parts: [
        {
          type: 'text',
          text: '用户输入的新内容',
        },
      ],
    } as never);

    expect(pluginRuntime.runMessageUpdatedHooks).toHaveBeenCalledWith({
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
        conversationId: 'conversation-1',
        messageId: 'message-1',
        currentMessage: {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          parts: [
            {
              type: 'text',
              text: '旧内容',
            },
          ],
          status: 'completed',
        },
        nextMessage: {
          role: 'user',
          content: '用户输入的新内容',
          parts: [
            {
              type: 'text',
              text: '用户输入的新内容',
            },
          ],
          status: 'completed',
        },
      },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: {
        content: '插件改写后的新内容',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ]),
        status: 'completed',
        error: null,
      },
    });
  });

  it('dispatches message:deleted hooks before deleting a message', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          partsJson: null,
          status: 'completed',
          provider: 'openai',
          model: 'gpt-5.2',
        },
      ],
    });
    prisma.message.delete.mockResolvedValue({
      id: 'message-1',
    });

    await service.deleteMessage('user-1', 'conversation-1', 'message-1');

    expect(pluginRuntime.runMessageDeletedHooks).toHaveBeenCalledWith({
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
        conversationId: 'conversation-1',
        messageId: 'message-1',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          parts: [],
          provider: 'openai',
          model: 'gpt-5.2',
          status: 'completed',
        },
      },
    });
    expect(prisma.message.delete).toHaveBeenCalledWith({
      where: { id: 'message-1' },
    });
  });
});
