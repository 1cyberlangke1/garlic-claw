import {
  buildCurrentHostProviderInfo,
  buildHostGenerateResult,
  buildHostGenerateTextResult,
  buildHostProviderModelSummary,
  findHostProviderSummary,
  resolveHostProviderModelSummary,
  resolveHostUtilityRoleForGeneration,
} from '@garlic-claw/shared';
import {
  buildHostGenerateExecutionInput,
  findHostProviderSummaryOrThrow,
  readHostGenerateParams,
  readHostLlmMessages,
} from './plugin-host-ai.facade';
import {
  buildConversationMessageSummaries,
} from '@garlic-claw/shared';
import { requireHostConversationRecord, requireHostUserSummary } from './plugin-host-conversation.facade';

describe('plugin-host.helpers', () => {
  it('reads host generate params', () => {
    expect(
      readHostGenerateParams(
        {
          providerId: 'provider-1',
          modelId: 'model-1',
          system: 'sys',
          headers: {
            Authorization: 'Bearer token',
          },
          maxOutputTokens: 128,
        },
        [{ role: 'user', content: 'hello' }],
      ),
    ).toEqual({
      providerId: 'provider-1',
      modelId: 'model-1',
      system: 'sys',
      headers: {
        Authorization: 'Bearer token',
      },
      maxOutputTokens: 128,
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('resolves utility role for generation', () => {
    const params = {} as { providerId?: string; modelId?: string };

    expect(
      resolveHostUtilityRoleForGeneration(
        'builtin.conversation-title',
        {
          source: 'plugin',
          activeProviderId: 'provider-1',
          activeModelId: 'model-1',
        },
        params,
      ),
    ).toBe('conversationTitle');
    expect(params).toEqual({
      providerId: 'provider-1',
      modelId: 'model-1',
    });

    expect(
      resolveHostUtilityRoleForGeneration(
        'plugin.demo',
        {
          source: 'plugin',
        },
        {},
      ),
    ).toBe('pluginGenerateText');
  });

  it('reads structured llm messages', () => {
    expect(
      readHostLlmMessages({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'hello',
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
      },
    ]);
  });

  it('builds current provider info from context or fallback model config', () => {
    expect(
      buildCurrentHostProviderInfo(
        {
          source: 'plugin',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        {
          providerId: 'anthropic',
          id: 'claude-3-7-sonnet',
        },
      ),
    ).toEqual({
      source: 'context',
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(
      buildCurrentHostProviderInfo(
        {
          source: 'plugin',
        },
        {
          providerId: 'anthropic',
          id: 'claude-3-7-sonnet',
        },
      ),
    ).toEqual({
      source: 'default',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
  });

  it('builds provider model summaries and host generate results', () => {
    expect(
      buildHostProviderModelSummary({
        id: 'gpt-5.2',
        providerId: 'openai',
        name: 'GPT-5.2',
        capabilities: {
          input: { text: true, image: true },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
        status: 'active',
      }),
    ).toEqual({
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT-5.2',
      capabilities: {
        input: { text: true, image: true },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      status: 'active',
    });

    expect(
      buildHostGenerateResult({
        modelConfig: {
          providerId: 'anthropic',
          id: 'claude-3-7-sonnet',
        },
        result: {
          text: 'summary',
          finishReason: 'stop',
          usage: {
            inputTokens: 12,
            outputTokens: 4,
          },
        },
      }),
    ).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: 'summary',
      message: {
        role: 'assistant',
        content: 'summary',
      },
      finishReason: 'stop',
      usage: {
        inputTokens: 12,
        outputTokens: 4,
      },
    });

    expect(
      buildHostGenerateExecutionInput({
        params: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          system: '你是助手',
          variant: 'balanced',
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
            },
          },
          headers: {
            Authorization: 'Bearer token',
          },
          maxOutputTokens: 128,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'hello',
                },
              ],
            },
          ],
        },
        utilityRole: 'pluginGenerateText',
      }),
    ).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      utilityRole: 'pluginGenerateText',
      system: '你是助手',
      variant: 'balanced',
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
        },
      },
      headers: {
        Authorization: 'Bearer token',
      },
      maxOutputTokens: 128,
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
            },
          ],
        },
      ],
    });

    expect(
      buildHostGenerateTextResult({
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        text: 'summary',
      }),
    ).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: 'summary',
    });
  });

  it('finds provider summaries and resolves provider model summaries', () => {
    expect(
      findHostProviderSummary(
        [
          {
            id: 'openai',
            name: 'OpenAI',
            mode: 'catalog',
            driver: 'openai',
            defaultModel: 'gpt-5.2',
            available: true,
          },
          {
            id: 'anthropic',
            name: 'Anthropic',
            mode: 'catalog',
            driver: 'anthropic',
            defaultModel: 'claude-3-7-sonnet',
            available: true,
          },
        ],
        'anthropic',
      ),
    ).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      mode: 'catalog',
      driver: 'anthropic',
      defaultModel: 'claude-3-7-sonnet',
      available: true,
    });
    expect(findHostProviderSummary([], 'missing')).toBeNull();
    expect(
      findHostProviderSummaryOrThrow({
        providers: [
          {
            id: 'anthropic',
            name: 'Anthropic',
            mode: 'catalog',
            driver: 'anthropic',
            defaultModel: 'claude-3-7-sonnet',
            available: true,
          },
        ],
        providerId: 'anthropic',
      }),
    ).toEqual({
      id: 'anthropic',
      name: 'Anthropic',
      mode: 'catalog',
      driver: 'anthropic',
      defaultModel: 'claude-3-7-sonnet',
      available: true,
    });
    expect(() =>
      findHostProviderSummaryOrThrow({
        providers: [],
        providerId: 'missing',
        ensureExists: () => {
          throw new Error('fallback');
        },
      }),
    ).toThrow('fallback');

    expect(
      resolveHostProviderModelSummary({
        registryModel: {
          id: 'gpt-5.2',
          providerId: 'openai',
          name: 'GPT-5.2',
          capabilities: {
            input: { text: true, image: true },
            output: { text: true, image: false },
            reasoning: true,
            toolCall: true,
          },
          status: 'active',
        },
        listedModels: [],
        modelId: 'gpt-5.2',
      }),
    ).toEqual({
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT-5.2',
      capabilities: {
        input: { text: true, image: true },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      status: 'active',
    });

    expect(
      resolveHostProviderModelSummary({
        listedModels: [
          {
            id: 'claude-3-7-sonnet',
            providerId: 'anthropic',
            name: 'Claude 3.7 Sonnet',
            capabilities: {
              input: { text: true, image: true },
              output: { text: true, image: false },
              reasoning: true,
              toolCall: false,
            },
            status: 'beta',
          },
        ],
        modelId: 'claude-3-7-sonnet',
      }),
    ).toEqual({
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      name: 'Claude 3.7 Sonnet',
      capabilities: {
        input: { text: true, image: true },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: false,
      },
      status: 'beta',
    });
    expect(
      resolveHostProviderModelSummary({
        listedModels: [],
        modelId: 'missing',
      }),
    ).toBeNull();
  });

  it('guards conversation and user records and builds message summaries', () => {
    expect(
      requireHostConversationRecord({
        conversation: {
          id: 'conversation-1',
          title: 'New Chat',
          userId: 'user-1',
          createdAt: new Date('2026-03-27T08:00:00.000Z'),
          updatedAt: new Date('2026-03-27T08:05:00.000Z'),
        },
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.get',
      }),
    ).toEqual({
      id: 'conversation-1',
      title: 'New Chat',
      userId: 'user-1',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:05:00.000Z'),
    });

    expect(() =>
      requireHostConversationRecord({
        conversation: null,
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.get',
      }),
    ).toThrow('Conversation not found: conversation-1');

    expect(() =>
      requireHostConversationRecord({
        conversation: {
          id: 'conversation-1',
          title: 'New Chat',
          userId: 'user-2',
          createdAt: new Date('2026-03-27T08:00:00.000Z'),
          updatedAt: new Date('2026-03-27T08:05:00.000Z'),
        },
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.get',
      }),
    ).toThrow('conversation.get 无权访问当前会话');

    expect(
      requireHostUserSummary({
        user: {
          id: 'user-1',
          username: 'garlic',
          email: 'garlic@example.com',
          role: 'admin',
          createdAt: new Date('2026-03-27T08:00:00.000Z'),
          updatedAt: new Date('2026-03-27T08:05:00.000Z'),
        },
        userId: 'user-1',
      }),
    ).toEqual({
      id: 'user-1',
      username: 'garlic',
      email: 'garlic@example.com',
      role: 'admin',
      createdAt: '2026-03-27T08:00:00.000Z',
      updatedAt: '2026-03-27T08:05:00.000Z',
    });

    expect(() =>
      requireHostUserSummary({
        user: null,
        userId: 'user-1',
      }),
    ).toThrow('User not found: user-1');

    expect(
      buildConversationMessageSummaries([
        {
          id: 'message-1',
          role: 'user',
          content: '你好',
          partsJson: JSON.stringify([
            {
              type: 'text',
              text: '你好',
            },
          ]),
          status: 'completed',
          createdAt: new Date('2026-03-27T08:01:00.000Z'),
          updatedAt: new Date('2026-03-27T08:01:00.000Z'),
        },
      ]),
    ).toEqual([
      {
        id: 'message-1',
        role: 'user',
        content: '你好',
        parts: [
          {
            type: 'text',
            text: '你好',
          },
        ],
        status: 'completed',
        createdAt: '2026-03-27T08:01:00.000Z',
        updatedAt: '2026-03-27T08:01:00.000Z',
      },
    ]);
  });
});
