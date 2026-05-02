import type { JsonObject } from '@garlic-claw/shared';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createConversationHistorySignatureFromHistoryMessages } from '../../src/conversation/conversation-history-signature';
import { ContextGovernanceService } from '../../src/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/conversation/context-governance-settings.service';
import { ConversationStoreService } from '../../src/runtime/host/conversation-store.service';

type GenerateTextInput = {
  allowFallbackChatModels?: boolean;
  messages: Array<{ content: string; role: 'user' }>;
  modelId?: string;
  providerId?: string;
  transportMode?: 'generate' | 'stream-collect';
};

describe('ContextGovernanceService', () => {
  let settingsConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let settingsService: ContextGovernanceSettingsService;
  let conversationRecordService: ConversationStoreService;
  let service: ContextGovernanceService;

  const aiManagementService = {
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
    listProviders: jest.fn(),
  };
  const aiModelExecutionService = {
    generateText: jest.fn<Promise<{ modelId: string; providerId: string; text: string }>, [GenerateTextInput]>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settingsConfigPath = path.join(
      os.tmpdir(),
      `settings.service.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `context-governance.service.conversations-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsConfigPath;
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    aiManagementService.getDefaultProviderSelection.mockReturnValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });
    aiManagementService.getProvider.mockImplementation((providerId: string) => {
      if (providerId === 'openai') {
        return {
          defaultModel: 'gpt-4.1-mini',
          id: 'openai',
          models: ['gpt-4.1-mini'],
        };
      }
      return {
        defaultModel: 'gpt-oss-20b',
        id: 'nvidia',
        models: ['gpt-oss-20b'],
      };
    });
    aiManagementService.getProviderModel.mockImplementation((providerId: string, modelId: string) => ({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: providerId === 'openai' ? 2048 : 1024,
      id: modelId,
      name: modelId,
      providerId,
      status: 'active',
    }));
    aiManagementService.listProviders.mockReturnValue([{ id: 'nvidia' }]);
    settingsService = new ContextGovernanceSettingsService();
    conversationRecordService = new ConversationStoreService();
    conversationId = (
      conversationRecordService.createConversation({
        title: '新的对话',
        userId: 'user-1',
      }) as { id: string }
    ).id;
    service = new ContextGovernanceService(
      aiManagementService as never,
      aiModelExecutionService as never,
      settingsService,
      conversationRecordService,
    );
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    for (const filePath of [settingsConfigPath, conversationsPath]) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 测试临时文件清理失败不应覆盖主断言。
      }
    }
  });

  it('generates a conversation title through the model execution owner', async () => {
    settingsService.updateConfig({
      conversationTitle: {
        defaultTitle: '新的对话',
        enabled: true,
      },
    } as never);
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '帮我整理一下今天的代码评审结论'),
      createHistoryMessage('message-2', 'assistant', '今天主要处理 provider smoke、subagent 和上下文压缩'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '代码评审结论',
    });

    await service.generateConversationTitleIfNeeded({
      conversationId,
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      allowFallbackChatModels: true,
      messages: [
        expect.objectContaining({
          role: 'user',
        }),
      ],
      transportMode: 'stream-collect',
    }));
    expect(conversationRecordService.requireConversation(conversationId, 'user-1').title).toBe('代码评审结论');
  });

  it('compacts conversation history through the summary model when /compact is received', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，说明 smoke 需要真实 provider。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，说明默认 provider 不能落到占位 key。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，说明 subagent 结果需要回写。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：真实 provider、默认选择、subagent 回写。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'deferred-short-circuit',
      deferred: expect.objectContaining({
        commandId: 'internal.context-governance:/compact:command',
        execute: expect.any(Function),
      }),
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    }));
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    const resolution = await result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    });
    expect(resolution).toEqual({
      assistantContent: '已压缩上下文，覆盖 2 条历史消息。',
      assistantParts: [{ text: '已压缩上下文，覆盖 2 条历史消息。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      allowFallbackChatModels: true,
      modelId: 'gpt-oss-20b',
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('最近用户目标 / 限制 / 待办 / 下一步事项'),
          role: 'user',
        }),
      ],
      providerId: 'nvidia',
      transportMode: 'stream-collect',
    }));
    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; id: string; metadata?: { annotations?: Array<{ data?: Record<string, unknown>; owner?: string; type?: string }> }; role: string }>;
    };
    const summaryMessage = history.messages.find((message) => message.content === '压缩摘要：真实 provider、默认选择、subagent 回写。');
    expect(summaryMessage?.role).toBe('display');
    expect(summaryMessage?.metadata?.annotations?.some((annotation) =>
      annotation.owner === 'conversation.context-governance'
      && annotation.type === 'context-compaction'
      && annotation.data?.role === 'summary')).toBe(true);
  });

  it('allows keepRecentMessages to be zero so summary compaction can replace all recent raw history', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 0,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，记录用户目标。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，记录现有约束。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，记录下一步事项。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：用户目标、现有约束、下一步事项。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '已压缩上下文，覆盖 3 条历史消息。',
      assistantParts: [{ text: '已压缩上下文，覆盖 3 条历史消息。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });

    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; role: string }>;
    };
    expect(history.messages.some((message) => message.role === 'display' && message.content === '压缩摘要：用户目标、现有约束、下一步事项。')).toBe(true);
    expect(history.messages.filter((message) => message.role !== 'display')).toHaveLength(3);
  });

  it('returns a clear failure message when /compact hits a compaction API error', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，说明 smoke 需要真实 provider。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，说明默认 provider 不能落到占位 key。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，说明 subagent 结果需要回写。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '当前上下文压缩失败，本次未替换历史。可稍后重试 /compact，或先清理部分历史后再继续。\n原因：compaction api failed',
      assistantParts: [{ text: '当前上下文压缩失败，本次未替换历史。可稍后重试 /compact，或先清理部分历史后再继续。\n原因：compaction api failed', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
  });

  it('does not report compaction as successful when the summary still leaves history over budget', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息。'.repeat(20)),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复。'.repeat(20)),
      createHistoryMessage('message-3', 'user', '第三条消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '仍然过长的摘要。'.repeat(40),
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '压缩后的上下文仍超过预算，本次未替换历史。',
      assistantParts: [{ text: '压缩后的上下文仍超过预算，本次未替换历史。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages).toHaveLength(3);
    expect(history.messages.some((message) => typeof message.content === 'string' && message.content.includes('仍然过长的摘要'))).toBe(false);
  });

  it('returns a clear failure message when the last oversized reply still leaves the conversation over budget after compaction', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 6,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '请直接写一篇超长文章。'),
      createHistoryMessage('message-2', 'assistant', '超长回复。'.repeat(500)),
    ], 'user-1');

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '压缩后的上下文仍超过预算，本次未替换历史。',
      assistantParts: [{ text: '压缩后的上下文仍超过预算，本次未替换历史。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    expect(aiModelExecutionService.generateText).toHaveBeenCalled();
  });

  it('does not secretly clamp the effective context budget to 256 when the configured context length is 10000', async () => {
    aiManagementService.getProviderModel.mockImplementation((providerId: string, modelId: string) => ({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: 10_000,
      id: modelId,
      name: modelId,
      providerId,
      status: 'active',
    }));
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 50,
        enabled: true,
        keepRecentMessages: 2,
        reservedTokens: 12_000,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段历史消息，用来验证 10000 上下文长度不会被偷偷压成 256。'.repeat(12)),
      createHistoryMessage('message-2', 'assistant', '第二段历史回复，用来让当前上下文占用明显高于 128，但仍远低于 10000 的 50%。'.repeat(12)),
      createHistoryMessage('message-3', 'user', '第三段消息保留在最近窗口内。'),
    ], 'user-1');

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const preview = await service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });
    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(preview.contextLength).toBe(10_000);
    expect(preview.estimatedTokens).toBeGreaterThan(128);
    expect(preview.estimatedTokens).toBeLessThan(5_000);
    expect(preview.source).toBe('estimated');
    expect(aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(beforeModel).toEqual({
      action: 'continue',
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
    });
  });

  it('auto compacts history before model execution and short-circuits the current reply when auto continue is disabled', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        allowAutoContinue: false,
        compressionThreshold: 20,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 900,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段较长的历史消息，用来触发自动压缩阈值。'.repeat(10)),
      createHistoryMessage('message-2', 'assistant', '第二段较长的历史回复，用来确保压缩候选不为空。'.repeat(10)),
      createHistoryMessage('message-3', 'user', '第三段消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '自动摘要。',
    });

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '第三段消息保留给最近窗口。', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledTimes(1);
    expect(beforeModel).toEqual({
      action: 'short-circuit',
      assistantContent: '已完成上下文压缩，本轮不继续生成主回复。',
      assistantParts: [{ text: '已完成上下文压缩，本轮不继续生成主回复。', type: 'text' }],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      reason: 'context-compaction:auto-stop',
    });
  });

  it('does not let stale provider usage suppress auto compaction threshold checks', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 10,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧历史',
        createdAt: '2026-04-26T00:00:00.000Z',
        id: 'stale-history',
        parts: [{ text: '旧历史', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-26T00:00:00.000Z',
      },
    ]);
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段较长的历史消息，用来确保当前真实历史已经超过自动压缩阈值。'.repeat(20)),
      {
        ...createHistoryMessage('message-2', 'assistant', '第二段较长的历史回复，附带的是上一轮旧 usage，不应该继续参与这轮阈值判断。'.repeat(20)),
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 8,
                modelId: 'gpt-oss-20b',
                outputTokens: 2,
                providerId: 'nvidia',
                responseHistorySignature: staleSignature,
                source: 'provider',
                totalTokens: 10,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
      createHistoryMessage('message-3', 'user', '第三段消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '自动压缩摘要：当前历史过长，旧 usage 已失效。',
    });

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages.some((message) => message.content === '自动压缩摘要：当前历史过长，旧 usage 已失效。')).toBe(true);
  });

  it('surfaces provider token source in the context window preview when the current history matches real usage', async () => {
    const previewMessages = [
      {
        content: '第一条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [{ text: '第一条消息', type: 'text' as const }],
        role: 'user' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        content: '第二条消息',
        createdAt: '2026-04-25T00:01:00.000Z',
        id: 'history-2',
        parts: [{ text: '第二条消息', type: 'text' as const }],
        role: 'assistant' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-25T00:01:00.000Z',
      },
    ];
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(previewMessages);
    conversationRecordService.replaceMessages(conversationId, [
      previewMessages[0],
      {
        ...previewMessages[1],
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 88,
                modelId: 'gpt-oss-20b',
                outputTokens: 12,
                providerId: 'nvidia',
                responseHistorySignature,
                source: 'provider',
                totalTokens: 100,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
    ], 'user-1');

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 100,
      includedMessageIds: ['history-1', 'history-2'],
      source: 'provider',
    }));
  });

  it('uses the configured compression model while keeping context window budget bound to the active chat model', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionModel: {
          modelId: 'gpt-4.1-mini',
          providerId: 'openai',
        },
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复。'),
      createHistoryMessage('message-3', 'user', '第三条消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      text: '压缩摘要：改用独立压缩模型。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });
    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      transportMode: 'stream-collect',
    }));
    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; metadata?: { annotations?: Array<{ data?: Record<string, unknown> }> } }>;
    };
    const summaryMessage = history.messages.find((message) => message.content === '压缩摘要：改用独立压缩模型。');
    const summaryAnnotation = summaryMessage?.metadata?.annotations?.find((annotation) => annotation.data?.role === 'summary');
    expect(summaryAnnotation?.data).toEqual(expect.objectContaining({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
    }));
  });

  it('compacts history after an assistant message records spawn_subagent and wait_subagent tool events', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '先确认技能加载是否正常。'),
      createHistoryMessage('message-2', 'assistant', '技能已经加载。'),
      createHistoryMessage('message-3', 'user', '请创建一个子代理去探索 smoke 流程。'),
      createHistoryMessage('message-4', 'assistant', '子代理已完成：Smoke HTTP Flow 用于后端烟测。', {
        toolCalls: [
          {
            input: {
              description: '探索 smoke 技能',
              prompt: '请总结 smoke-http-flow 技能的用途',
              subagentType: 'review',
            },
            toolCallId: 'call_smoke_subagent_0',
            toolName: 'spawn_subagent',
          },
          {
            input: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
            },
            toolCallId: 'call_smoke_subagent_wait_0',
            toolName: 'wait_subagent',
          },
        ],
        toolResults: [
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              description: '探索 smoke 技能',
              status: 'queued',
            },
            toolCallId: 'call_smoke_subagent_0',
            toolName: 'spawn_subagent',
          },
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              result: {
                text: 'Smoke HTTP Flow 用于后端烟测。',
              },
              status: 'completed',
            },
            toolCallId: 'call_smoke_subagent_wait_0',
            toolName: 'wait_subagent',
          },
        ],
      }),
      createHistoryMessage('message-5', 'user', '最后再压缩一下上下文。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：技能加载、子代理探索、最终收口。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'deferred-short-circuit',
      reason: 'context-compaction:command',
    }));
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      assistantContent: '已压缩上下文，覆盖 4 条历史消息。',
      reason: 'context-compaction:command',
    }));
  });

  it('does not block the next reply with “当前历史还不足以生成稳定摘要” when only raw tool payloads inflated the preview', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 50,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 900,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      {
        content: '工具已经执行完了。',
        createdAt: '2026-05-02T10:00:00.000Z',
        id: 'assistant-tool-heavy',
        parts: [{ text: '工具已经执行完了。', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        toolResults: [
          {
            output: {
              data: {
                stderr: 'warn'.repeat(500),
                stdout: 'line'.repeat(2500),
              },
              kind: 'tool:text',
              value: '执行完成',
            },
            toolCallId: 'call-heavy-1',
            toolName: 'bash',
          },
        ],
        updatedAt: '2026-05-02T10:00:00.000Z',
      } as JsonObject,
    ], 'user-1');

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(beforeModel).toEqual({
      action: 'continue',
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
    });
  });
});

function createHistoryMessage(
  id: string,
  role: 'assistant' | 'user',
  content: string,
  extra?: {
    toolCalls?: JsonObject[];
    toolResults?: JsonObject[];
  },
): JsonObject {
  return {
    content,
    createdAt: '2026-04-27T00:00:00.000Z',
    id,
    parts: [{ text: content, type: 'text' }],
    role,
    status: 'completed',
    ...(extra?.toolCalls ? { toolCalls: extra.toolCalls } : {}),
    ...(extra?.toolResults ? { toolResults: extra.toolResults } : {}),
    updatedAt: '2026-04-27T00:00:00.000Z',
  };
}
