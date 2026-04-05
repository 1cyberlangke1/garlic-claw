import { ModuleRef } from '@nestjs/core';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';

describe('ChatMessageOrchestrationService', () => {
  const pluginChatRuntime = {
    applyChatBeforeModelHooks: jest.fn(),
    dispatchChatWaitingModel: jest.fn(),
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const modelInvocation = {
    streamPrepared: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  let service: ChatMessageOrchestrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    moduleRef.get.mockImplementation((token: { name?: string }) =>
      token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
    pluginChatRuntime.applyChatBeforeModelHooks.mockImplementation(async (input) => ({
      action: 'continue',
      request: {
        providerId: input.modelConfig.providerId,
        modelId: input.modelConfig.id,
        systemPrompt: input.systemPrompt,
        messages: input.messages,
        availableTools: [],
      },
      modelConfig: {
        providerId: input.modelConfig.providerId,
        id: input.modelConfig.id,
        capabilities: {
          toolCall: true,
        },
      },
      buildToolSet: jest.fn(),
    }));
    pluginChatRuntime.dispatchChatWaitingModel.mockResolvedValue(undefined);
    pluginChatRuntime.applyFinalResponseHooks.mockImplementation(async (input) => input.result);
    pluginChatRuntime.runResponseAfterSendHooks.mockResolvedValue(undefined);
    modelInvocation.streamPrepared.mockReturnValue({
      modelConfig: {
        id: 'claude-3-7-sonnet',
        providerId: 'anthropic',
      },
      result: {
        fullStream: {},
      },
    });
    service = new ChatMessageOrchestrationService(
      modelInvocation as never,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('delegates before-model preparation to the plugin chat runtime facade', async () => {
    const result = await service.applyChatBeforeModelHooks({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      systemPrompt: '你是 Garlic Claw',
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-5.2',
      },
      messages: [
        {
          role: 'user',
          content: '列出命令',
        },
      ],
    });

    expect(pluginChatRuntime.applyChatBeforeModelHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      systemPrompt: '你是 Garlic Claw',
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-5.2',
      },
      messages: [
        {
          role: 'user',
          content: '列出命令',
        },
      ],
    });
    expect(result).toMatchObject({
      action: 'continue',
      request: expect.objectContaining({
        providerId: 'openai',
        modelId: 'gpt-5.2',
      }),
    });
  });

  it('builds a stream factory that asks the plugin chat runtime facade to dispatch waiting-model', async () => {
    const createStream = service.buildStreamFactory({
      assistantMessageId: 'assistant-message-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '请先检查冲突命令',
        messages: [],
        availableTools: [],
      },
      preparedInvocation: {
        modelConfig: {
          id: 'claude-3-7-sonnet',
          providerId: 'anthropic',
        },
        model: {},
        sdkMessages: [],
        sourceSdkMessages: [],
      } as never,
      activeProviderId: 'anthropic',
      activeModelId: 'claude-3-7-sonnet',
      activePersonaId: 'builtin.default-assistant',
      tools: undefined as never,
    });

    const abortController = new AbortController();
    const streamResult = createStream(abortController.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pluginChatRuntime.dispatchChatWaitingModel).toHaveBeenCalledWith({
      assistantMessageId: 'assistant-message-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '请先检查冲突命令',
        messages: [],
        availableTools: [],
      },
      activeProviderId: 'anthropic',
      activeModelId: 'claude-3-7-sonnet',
      activePersonaId: 'builtin.default-assistant',
    });
    expect(modelInvocation.streamPrepared).toHaveBeenCalled();
    expect(streamResult).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      stream: {
        fullStream: {},
      },
    });
  });

  it('delegates final response hook composition to the plugin chat runtime facade', async () => {
    const result = await service.applyFinalResponseHooks({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'model',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: 'original',
        parts: [],
        toolCalls: [],
        toolResults: [],
      },
    });

    expect(pluginChatRuntime.applyFinalResponseHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'model',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: 'original',
        parts: [],
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(result).toEqual({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: 'original',
      parts: [],
      toolCalls: [],
      toolResults: [],
    });
  });
});
