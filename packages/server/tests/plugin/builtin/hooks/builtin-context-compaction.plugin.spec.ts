import type {
  JsonValue,
  PluginConversationHistoryMessage,
  PluginConversationHistoryPreviewParams,
  PluginConversationHistoryPreviewResult,
} from '@garlic-claw/shared';
import { BUILTIN_CONTEXT_COMPACTION_PLUGIN } from '../../../../src/plugin/builtin/hooks/builtin-context-compaction.plugin';

describe('BuiltinContextCompactionPlugin', () => {
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('short-circuits /compress through message:received and writes compacted history back', async () => {
    const messageReceivedHook = BUILTIN_CONTEXT_COMPACTION_PLUGIN.hooks?.['message:received'];
    expect(messageReceivedHook).toBeDefined();
    const host = createCompactionHost({
      config: {
        compressionThreshold: 1,
        keepRecentMessages: 1,
        mode: 'manual',
        reservedTokens: 256,
        showCoveredMarker: true,
      },
      history: createHistorySnapshot([
        createHistoryMessage('history-1', 'user', '第一条历史消息'),
        createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
        createHistoryMessage('history-3', 'user', '请基于上面的历史继续回答。'),
      ]),
      modelContextLength: 512,
    });

    await expect(
      messageReceivedHook!(
        {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'http-route',
            userId: 'user-1',
          },
          conversationId: 'conversation-1',
          message: {
            content: '/compress',
            parts: [
              {
                text: '/compress',
                type: 'text',
              },
            ],
            role: 'user',
          },
          modelId: 'gpt-5.4',
          modelMessages: [
            {
              content: '/compress',
              role: 'user',
            },
          ],
          providerId: 'openai',
          session: null,
        } as never,
        {
          callContext: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'http-route',
            userId: 'user-1',
          },
          host: host.facade,
        } as never,
      ),
    ).resolves.toEqual({
      action: 'short-circuit',
      assistantContent: '已压缩上下文，覆盖 2 条历史消息。',
      assistantParts: [
        {
          text: '已压缩上下文，覆盖 2 条历史消息。',
          type: 'text',
        },
      ],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });

    expect(host.history.messages.some((message: PluginConversationHistoryMessage) =>
      message.id.startsWith('context-compaction:'),
    )).toBe(true);
  });

  it('does not treat mixed messages as context compaction commands', async () => {
    const messageReceivedHook = BUILTIN_CONTEXT_COMPACTION_PLUGIN.hooks?.['message:received'];
    expect(messageReceivedHook).toBeDefined();
    const host = createCompactionHost({
      config: {
        compressionThreshold: 1,
        keepRecentMessages: 1,
        mode: 'manual',
        reservedTokens: 256,
        showCoveredMarker: true,
      },
      history: createHistorySnapshot([
        createHistoryMessage('history-1', 'user', '第一条历史消息'),
        createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
      ]),
      modelContextLength: 512,
    });

    await expect(
      messageReceivedHook!(
        {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'http-route',
            userId: 'user-1',
          },
          conversationId: 'conversation-1',
          message: {
            content: '/compact',
            parts: [
              {
                text: '/compact',
                type: 'text',
              },
              {
                image: 'data:image/png;base64,AAAA',
                mimeType: 'image/png',
                type: 'image',
              },
            ],
            role: 'user',
          },
          modelId: 'gpt-5.4',
          modelMessages: [
            {
              content: [
                {
                  text: '/compact',
                  type: 'text',
                },
                {
                  image: 'data:image/png;base64,AAAA',
                  mimeType: 'image/png',
                  type: 'image',
                },
              ],
              role: 'user',
            },
          ],
          providerId: 'openai',
          session: null,
        } as never,
        {
          callContext: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'http-route',
            userId: 'user-1',
          },
          host: host.facade,
        } as never,
      ),
    ).resolves.toEqual({
      action: 'pass',
    });

    expect(host.facade.replaceConversationHistory).not.toHaveBeenCalled();
  });

  it('runs manual compaction through the plugin route and writes summary annotations back to history', async () => {
    const routeHandler = BUILTIN_CONTEXT_COMPACTION_PLUGIN.routes?.['context-compaction/run'];
    expect(routeHandler).toBeDefined();
    const host = createCompactionHost({
      config: {
        compressionThreshold: 1,
        keepRecentMessages: 1,
        mode: 'manual',
        reservedTokens: 256,
        showCoveredMarker: true,
      },
      history: createHistorySnapshot([
        createHistoryMessage('history-1', 'user', '第一条历史消息'),
        createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
        createHistoryMessage('history-3', 'user', '请基于上面的历史继续回答。'),
      ]),
      modelContextLength: 512,
    });

    const response = await routeHandler!(
      {
        body: {
          conversationId: 'conversation-1',
          modelId: 'gpt-5.4',
          providerId: 'openai',
        },
        headers: {},
        method: 'POST',
        path: 'context-compaction/run',
        query: {},
      },
      {
        callContext: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId: 'conversation-1',
          source: 'plugin',
          userId: 'user-1',
        },
        host: host.facade,
      } as never,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      compacted: true,
      coveredMessageCount: 2,
      summaryMessageId: expect.any(String),
    }));

    const summaryMessage = host.history.messages.find((message: PluginConversationHistoryMessage) =>
      message.id.startsWith('context-compaction:'),
    );
    const coveredMessages = host.history.messages.filter((message: PluginConversationHistoryMessage) =>
      (message.metadata?.annotations ?? []).some(
        (annotation) =>
          annotation.type === 'context-compaction'
          && annotation.owner === 'builtin.context-compaction'
          && (annotation.data as { role?: string } | undefined)?.role === 'covered',
      ),
    );

    expect(summaryMessage).toEqual(expect.objectContaining({
      content: '压缩后的历史摘要',
      metadata: {
        annotations: [
          expect.objectContaining({
            data: expect.objectContaining({
              coveredCount: 2,
              role: 'summary',
              trigger: 'manual',
            }),
            owner: 'builtin.context-compaction',
            type: 'context-compaction',
            version: '1',
          }),
        ],
      },
      role: 'display',
    }));
    expect(summaryMessage?.id.replace('context-compaction:', '')).toMatch(uuidV7Pattern);
    expect(coveredMessages).toHaveLength(2);
  });

  it('rewrites history before model execution and only keeps the summary plus recent messages in the effective view', async () => {
    const historyRewriteHook = BUILTIN_CONTEXT_COMPACTION_PLUGIN.hooks?.['conversation:history-rewrite'];
    const beforeModelHook = BUILTIN_CONTEXT_COMPACTION_PLUGIN.hooks?.['chat:before-model'];
    expect(historyRewriteHook).toBeDefined();
    expect(beforeModelHook).toBeDefined();
    const host = createCompactionHost({
      config: {
        allowAutoContinue: true,
        compressionThreshold: 1,
        keepRecentMessages: 1,
        mode: 'auto',
        reservedTokens: 256,
        showCoveredMarker: false,
      },
      history: createHistorySnapshot([
        createHistoryMessage('history-1', 'user', '第一条历史消息'),
        createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
        createHistoryMessage('history-3', 'user', '请基于上面的历史继续回答。'),
      ]),
      modelContextLength: 512,
    });

    await expect(
      historyRewriteHook!(
        {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          conversationId: 'conversation-1',
          history: host.history,
          trigger: 'prepare-model',
        } as never,
        {
          callContext: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          host: host.facade,
        } as never,
      ),
    ).resolves.toEqual({ action: 'pass' });

    expect(host.history.messages).toHaveLength(4);

    await expect(
      beforeModelHook!(
        {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          request: {
            availableTools: [],
            messages: host.history.messages.map((message: PluginConversationHistoryMessage) => ({
              content: message.parts?.length ? message.parts : (message.content ?? ''),
              role: message.role === 'assistant' ? 'assistant' : 'user',
            })),
            modelId: 'gpt-5.4',
            providerId: 'openai',
            systemPrompt: '你是默认助手。',
          },
        } as never,
        {
          callContext: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          host: host.facade,
        } as never,
      ),
    ).resolves.toEqual({
      action: 'mutate',
      messages: [
        {
          content: [
            {
              text: '压缩后的历史摘要',
              type: 'text',
            },
          ],
          role: 'assistant',
        },
        {
          content: [
            {
              text: '请基于上面的历史继续回答。',
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
    });
  });

  it('uses a sliding window when strategy is sliding and trims oldest history messages before model execution', async () => {
    const beforeModelHook = BUILTIN_CONTEXT_COMPACTION_PLUGIN.hooks?.['chat:before-model'];
    expect(beforeModelHook).toBeDefined();
    const host = createCompactionHost({
      config: {
        keepRecentMessages: 1,
        mode: 'auto',
        reservedTokens: 256,
        slidingWindowUsagePercent: 50,
        strategy: 'sliding',
      },
      history: createHistorySnapshot([
        createHistoryMessage('history-1', 'user', 'a'.repeat(220)),
        createHistoryMessage('history-2', 'assistant', 'b'.repeat(220)),
        createHistoryMessage('history-3', 'user', 'c'.repeat(220)),
      ]),
      modelContextLength: 512,
    });

    await expect(
      beforeModelHook!(
        {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          request: {
            availableTools: [],
            messages: host.history.messages.map((message: PluginConversationHistoryMessage) => ({
              content: message.parts?.length ? message.parts : (message.content ?? ''),
              role: message.role === 'assistant' ? 'assistant' : 'user',
            })),
            modelId: 'gpt-5.4',
            providerId: 'openai',
            systemPrompt: '你是默认助手。',
          },
        } as never,
        {
          callContext: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          host: host.facade,
        } as never,
      ),
    ).resolves.toEqual({
      action: 'mutate',
      messages: [
        {
          content: [
            {
              text: 'b'.repeat(220),
              type: 'text',
            },
          ],
          role: 'assistant',
        },
        {
          content: [
            {
              text: 'c'.repeat(220),
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
    });

    expect(host.facade.replaceConversationHistory).not.toHaveBeenCalled();
    expect(host.facade.generateText).not.toHaveBeenCalled();
  });
});

function createCompactionHost(input: {
  config: Record<string, JsonValue>;
  history: {
    conversationId: string;
    revision: string;
    messages: PluginConversationHistoryMessage[];
  };
  modelContextLength?: number;
}) {
  const currentHostState = {
    history: input.history,
  };
  let revisionVersion = 1;
  let autoStopState: JsonValue = null;
  const facade = {
    deleteState: jest.fn(async () => {
      autoStopState = null;
      return true;
    }),
    generateText: jest.fn(async () => ({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: '压缩后的历史摘要',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        source: 'provider',
        totalTokens: 20,
      },
    })),
    getConfig: jest.fn(async () => input.config),
    getConversationHistory: jest.fn(async () => currentHostState.history),
    getCurrentProvider: jest.fn(async () => ({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      source: 'context',
    })),
    getProviderModel: jest.fn(async () => ({
      capabilities: {
        input: {
          image: false,
          text: true,
        },
        output: {
          image: false,
          text: true,
        },
        reasoning: false,
        toolCall: true,
      },
      contextLength: input.modelContextLength ?? 128 * 1024,
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      providerId: 'openai',
      status: 'active',
    })),
    getState: jest.fn(async () => autoStopState),
    previewConversationHistory: jest.fn(async (params: PluginConversationHistoryPreviewParams = {}) =>
      previewHistoryMessages(params.messages ?? currentHostState.history.messages),
    ),
    replaceConversationHistory: jest.fn(async (params: {
      expectedRevision: string;
      messages: PluginConversationHistoryMessage[];
    }) => {
      expect(params.expectedRevision).toBe(currentHostState.history.revision);
      revisionVersion += 1;
      currentHostState.history = {
        conversationId: currentHostState.history.conversationId,
        messages: structuredClone(params.messages),
        revision: `conversation-1:revision:${revisionVersion}`,
      };
      return {
        changed: true,
        ...currentHostState.history,
      };
    }),
    setState: jest.fn(async (_key: string, value: JsonValue) => {
      autoStopState = structuredClone(value);
      return value;
    }),
  };
  return {
    facade,
    get history() {
      return currentHostState.history;
    },
  };
}

function createHistorySnapshot(messages: PluginConversationHistoryMessage[]) {
  return {
    conversationId: 'conversation-1',
    messages: structuredClone(messages),
    revision: 'conversation-1:revision:1',
  };
}

function createHistoryMessage(
  id: string,
  role: 'assistant' | 'user',
  text: string,
): PluginConversationHistoryMessage {
  return {
    content: text,
    createdAt: '2026-04-19T09:00:00.000Z',
    id,
    parts: [
      {
        text,
        type: 'text',
      },
    ],
    role,
    status: 'completed',
    updatedAt: '2026-04-19T09:00:00.000Z',
  };
}

function previewHistoryMessages(
  messages: PluginConversationHistoryMessage[],
): PluginConversationHistoryPreviewResult {
  const textBytes = Buffer.byteLength(
    messages
      .map((message) => {
        const partText = (message.parts ?? [])
          .filter((part): part is Extract<PluginConversationHistoryMessage['parts'][number], { type: 'text' }> => part.type === 'text')
          .map((part) => part.text)
          .join('\n');
        return [message.role, partText || message.content || ''].filter(Boolean).join('\n');
      })
      .join('\n'),
    'utf8',
  );
  return {
    estimatedTokens: Math.ceil(textBytes / 4),
    messageCount: messages.length,
    textBytes,
  };
}
