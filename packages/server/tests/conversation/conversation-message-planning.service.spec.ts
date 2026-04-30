import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConversationMessagePlanningService } from '../../src/conversation/conversation-message-planning.service';
import { ContextGovernanceService } from '../../src/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/conversation/context-governance-settings.service';
import { RuntimeHostConversationRecordService } from '../../src/runtime/host/runtime-host-conversation-record.service';

describe('ConversationMessagePlanningService', () => {
  const aiManagementService = {
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
    listProviders: jest.fn(),
  };
  const aiModelExecutionService = {
    generateText: jest.fn(),
    streamText: jest.fn(),
  };
  const aiVisionService = { resolveMessageParts: jest.fn() };
  const personaService = { readCurrentPersona: jest.fn() };
  const runtimeHostPluginDispatchService = { invokeHook: jest.fn(), listPlugins: jest.fn().mockReturnValue([]) };
  const toolRegistryService = { buildToolSet: jest.fn(), listAvailableTools: jest.fn() };

  let contextGovernanceConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let contextGovernanceSettingsService: ContextGovernanceSettingsService;
  let runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  let service: ConversationMessagePlanningService;

  beforeEach(() => {
    jest.clearAllMocks();
    contextGovernanceConfigPath = path.join(
      os.tmpdir(),
      `context-governance-planning.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `conversation-message-planning.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_CONTEXT_GOVERNANCE_CONFIG_PATH = contextGovernanceConfigPath;
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    aiManagementService.getDefaultProviderSelection.mockReturnValue({ modelId: 'gpt-5.4', providerId: 'openai', source: 'default' });
    aiManagementService.getProvider.mockReturnValue({ defaultModel: 'gpt-5.4', id: 'openai', models: ['gpt-5.4'] });
    aiManagementService.getProviderModel.mockReturnValue({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: 512,
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      providerId: 'openai',
      status: 'active',
    });
    aiManagementService.listProviders.mockReturnValue([{ id: 'openai' }]);
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: '压缩后的历史摘要',
    });
    runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
    contextGovernanceSettingsService = new ContextGovernanceSettingsService();
    conversationId = (runtimeHostConversationRecordService.createConversation({ title: '窗口预览', userId: 'user-1' }) as { id: string }).id;
    service = new ConversationMessagePlanningService(
      aiModelExecutionService as never,
      aiVisionService as never,
      new ContextGovernanceService(
        aiManagementService as never,
        aiModelExecutionService as never,
        contextGovernanceSettingsService,
        runtimeHostConversationRecordService,
      ),
      runtimeHostConversationRecordService,
      personaService as never,
      toolRegistryService as never,
      runtimeHostPluginDispatchService as never,
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
        // 忽略临时配置文件清理失败，避免影响测试主语义。
      }
    }
  });

  it('returns a sliding context window preview and trims oldest history messages', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 1,
        reservedTokens: 256,
        slidingWindowUsagePercent: 50,
        strategy: 'sliding',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createMessage('history-1', 'user', 'a'.repeat(220)),
      createMessage('history-2', 'assistant', 'b'.repeat(220)),
      createMessage('history-3', 'user', 'c'.repeat(220)),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, modelId: 'gpt-5.4', providerId: 'openai', userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: true,
      excludedMessageIds: ['history-1'],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['history-2', 'history-3'],
      keepRecentMessages: 1,
      slidingWindowUsagePercent: 50,
      strategy: 'sliding',
    }));
  });

  it('returns summary context preview from rewritten history and excludes covered messages', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 2,
        strategy: 'summary',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条历史消息', {
        annotations: [{
          data: {
            compactionId: 'compaction-1',
            coveredAt: '2026-04-25T00:00:00.000Z',
            markerVisible: true,
            role: 'covered',
            summaryMessageId: 'summary-1',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('history-2', 'assistant', '第二条历史回复', {
        annotations: [{
          data: {
            compactionId: 'compaction-1',
            coveredAt: '2026-04-25T00:00:00.000Z',
            markerVisible: true,
            role: 'covered',
            summaryMessageId: 'summary-1',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('summary-1', 'display', '压缩后的历史摘要', {
        annotations: [{
          data: {
            afterPreview: { estimatedTokens: 16, messageCount: 2, textBytes: 64 },
            beforePreview: { estimatedTokens: 32, messageCount: 3, textBytes: 128 },
            compactionId: 'compaction-1',
            coveredCount: 2,
            createdAt: '2026-04-25T00:00:00.000Z',
            modelId: 'gpt-5.4',
            providerId: 'openai',
            role: 'summary',
            trigger: 'manual',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('history-3', 'user', '请基于摘要继续回答'),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: true,
      excludedMessageIds: ['history-1', 'history-2'],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['summary-1', 'history-3'],
      keepRecentMessages: 2,
      slidingWindowUsagePercent: 50,
      strategy: 'summary',
    }));
  });

  it('falls back to plain history when context compaction is disabled', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: false,
        strategy: 'sliding',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条消息'),
      createMessage('summary-1', 'display', '摘要展示壳'),
      createMessage('history-2', 'assistant', '第二条消息'),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: false,
      estimatedTokens: 12,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['history-1', 'history-2'],
      keepRecentMessages: 6,
      slidingWindowUsagePercent: 50,
      strategy: 'sliding',
    }));
  });

  it('sanitizes preview messages before estimating tokens', async () => {
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      {
        content: '第一条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [
          { text: '第一条消息', type: 'text' as const },
          undefined as unknown as { text: string; type: 'text' },
        ],
        role: 'user',
        status: 'completed',
        toolCalls: [
          { name: 'ok' },
          undefined as unknown as { name: string },
        ],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      enabled: true,
      excludedMessageIds: [],
      includedMessageIds: ['history-1'],
      strategy: 'summary',
    }));
  });

  it('prefers the last matching provider usage annotation for context window preview tokens', async () => {
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条消息'),
      createMessage('history-2', 'assistant', '第二条消息', {
        annotations: [{
          data: {
            inputTokens: 88,
            modelId: 'gpt-5.4',
            outputTokens: 12,
            providerId: 'openai',
            source: 'provider',
            totalTokens: 100,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        }],
      }),
    ]);

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 88,
      includedMessageIds: ['history-1', 'history-2'],
    }));
  });

  it('keeps the model message chain unchanged when session todo changes', async () => {
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createMessage('history-1', 'assistant', '先前回复'),
      createMessage('history-2', 'user', '当前问题'),
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-pending',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({ role: 'assistant' }),
        expect.objectContaining({ role: 'user' }),
      ],
      system: '你是测试助手',
    }));
  });
});

function createMessage(
  id: string,
  role: string,
  content: string,
  metadata?: { annotations?: Array<{ data: object; owner: string; type: string; version: string }> },
) {
  return {
    content,
    createdAt: '2026-04-25T00:00:00.000Z',
    id,
    ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    parts: [{ text: content, type: 'text' as const }],
    role,
    status: 'completed',
    updatedAt: '2026-04-25T00:00:00.000Z',
  };
}
