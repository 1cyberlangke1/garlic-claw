import type { JsonObject } from '@garlic-claw/shared';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContextGovernanceService } from '../../src/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/conversation/context-governance-settings.service';
import { RuntimeHostConversationRecordService } from '../../src/runtime/host/runtime-host-conversation-record.service';

type GenerateTextInput = {
  allowFallbackChatModels?: boolean;
  messages: Array<{ content: string; role: 'user' }>;
  modelId?: string;
  providerId?: string;
  transportMode?: 'generate' | 'stream-collect';
};

describe('ContextGovernanceService', () => {
  let contextGovernanceConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let settingsService: ContextGovernanceSettingsService;
  let conversationRecordService: RuntimeHostConversationRecordService;
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
    contextGovernanceConfigPath = path.join(
      os.tmpdir(),
      `context-governance.service.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `context-governance.service.conversations-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_CONTEXT_GOVERNANCE_CONFIG_PATH = contextGovernanceConfigPath;
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
    conversationRecordService = new RuntimeHostConversationRecordService();
    conversationId = (
      conversationRecordService.createConversation({
        title: 'New Chat',
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
    delete process.env.GARLIC_CLAW_CONTEXT_GOVERNANCE_CONFIG_PATH;
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    for (const filePath of [contextGovernanceConfigPath, conversationsPath]) {
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
        mode: 'manual',
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
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
      providerId: 'nvidia',
      transportMode: 'generate',
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

  it('auto compacts history before model execution and short-circuits the current reply when auto continue is disabled', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        allowAutoContinue: false,
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 1,
        mode: 'auto',
        reservedTokens: 1,
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
      text: '自动压缩摘要：保留最近窗口并折叠更早历史。',
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

  it('uses the configured compression model while keeping context window budget bound to the active chat model', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionModel: {
          modelId: 'gpt-4.1-mini',
          providerId: 'openai',
        },
        enabled: true,
        keepRecentMessages: 1,
        mode: 'manual',
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
      transportMode: 'generate',
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
        mode: 'manual',
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
