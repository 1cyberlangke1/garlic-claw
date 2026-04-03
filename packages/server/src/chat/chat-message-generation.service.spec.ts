import { ChatMessageGenerationService } from './chat-message-generation.service';

describe('ChatMessageGenerationService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const aiProvider = {
    getModelConfig: jest.fn(),
  };

  const personaService = {
    getCurrentPersona: jest.fn(),
  };

  const pluginRuntime = {
    runMessageReceivedHooks: jest.fn(),
    runMessageCreatedHooks: jest.fn(),
  };

  const modelInvocation = {
    prepareResolved: jest.fn(),
  };

  const orchestration = {
    applyChatBeforeModelHooks: jest.fn(),
    buildStreamFactory: jest.fn(),
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const chatTaskService = {
    startTask: jest.fn(),
    stopTask: jest.fn(),
  };

  const completionService = {
    completeShortCircuitedAssistant: jest.fn(),
    applyVisionFallbackMetadata: jest.fn(),
    applyVisionFallbackMetadataToAssistant: jest.fn(),
  };

  const skillCommands = {
    tryHandleMessage: jest.fn(),
  };

  let service: ChatMessageGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    skillCommands.tryHandleMessage.mockResolvedValue(null);
    service = new ChatMessageGenerationService(
      prisma as never,
      chatService as never,
      aiProvider as never,
      personaService as never,
      pluginRuntime as never,
      modelInvocation as never,
      orchestration as never,
      chatTaskService as never,
      completionService as never,
      skillCommands as never,
    );
  });

  it('rejects new generation when llm is disabled for the conversation', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: false,
        ttsEnabled: true,
      }),
      messages: [],
    });

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '你好',
      } as never),
    ).rejects.toThrow('当前会话已关闭 LLM 自动回复');

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('marks a pending assistant message as stopped when no active task exists', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'assistant-message-1',
          role: 'assistant',
          status: 'pending',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);
    prisma.message.findUniqueOrThrow.mockResolvedValue({
      id: 'assistant-message-1',
      status: 'stopped',
    });
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.stopMessageGeneration('user-1', 'conversation-1', 'assistant-message-1'),
    ).resolves.toEqual({
      id: 'assistant-message-1',
      status: 'stopped',
    });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'assistant-message-1' },
      data: {
        status: 'stopped',
        error: null,
      },
    });
  });

  it('rejects retry when provider and model are both missing', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: true,
        ttsEnabled: true,
      }),
      messages: [
        {
          id: 'user-message-1',
          role: 'user',
          status: 'completed',
        },
        {
          id: 'assistant-message-1',
          role: 'assistant',
          provider: null,
          model: null,
          status: 'error',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);

    await expect(
      service.retryMessageGeneration('user-1', 'conversation-1', 'assistant-message-1', {}),
    ).rejects.toThrow('缺少重试所需的 provider/model');

    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });
});
