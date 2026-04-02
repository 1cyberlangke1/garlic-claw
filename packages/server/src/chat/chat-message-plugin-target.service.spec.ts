import { ChatMessagePluginTargetService } from './chat-message-plugin-target.service';

describe('ChatMessagePluginTargetService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const pluginRuntime = {
    runMessageCreatedHooks: jest.fn(),
  };

  let service: ChatMessagePluginTargetService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runMessageCreatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    service = new ChatMessagePluginTargetService(
      prisma as never,
      chatService as never,
      pluginRuntime as never,
    );
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
    pluginRuntime.runMessageCreatedHooks.mockResolvedValue({
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
    prisma.conversation.update.mockResolvedValue(null);

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

    expect(chatService.getConversation).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'conversation-2',
    );
    expect(chatService.getConversation).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'conversation-2',
    );
  });
});
