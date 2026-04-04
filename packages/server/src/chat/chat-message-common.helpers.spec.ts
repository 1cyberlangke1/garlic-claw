import {
  assertConversationLlmEnabled,
  getOwnedConversationMessage,
} from './chat-message-common.helpers';
import {
  createChatLifecycleContext,
  createChatModelLifecycleContext,
} from '@garlic-claw/shared';

describe('chat-message-common.helpers', () => {
  it('creates a normalized chat lifecycle context', () => {
    expect(
      createChatLifecycleContext({
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      }),
    ).toEqual({
      source: 'chat-hook',
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
      activePersonaId: 'builtin.default-assistant',
    });
  });

  it('creates a normalized chat model lifecycle context', () => {
    expect(
      createChatModelLifecycleContext({
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
        modelConfig: {
          providerId: 'openai',
          id: 'gpt-5.2',
        },
      }),
    ).toEqual({
      source: 'chat-tool',
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
      activePersonaId: 'builtin.default-assistant',
    });
  });

  it('rejects when the conversation llm host service is disabled', () => {
    expect(() =>
      assertConversationLlmEnabled({
        hostServicesJson: JSON.stringify({
          sessionEnabled: true,
          llmEnabled: false,
          ttsEnabled: true,
        }),
      }),
    ).toThrow('当前会话已关闭 LLM 自动回复');
  });

  it('reads an owned message from the conversation record', async () => {
    const chatService = {
      getConversation: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
          },
        ],
      }),
    };

    await expect(
      getOwnedConversationMessage(chatService as never, 'user-1', 'conversation-1', 'message-1'),
    ).resolves.toEqual({
      conversation: {
        id: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
          },
        ],
      },
      message: {
        id: 'message-1',
        role: 'user',
      },
    });
  });
});
