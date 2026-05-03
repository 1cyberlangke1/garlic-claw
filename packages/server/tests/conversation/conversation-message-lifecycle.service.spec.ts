import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ChatMessagePart } from '@garlic-claw/shared';
import { ConversationAfterResponseCompactionService } from '../../src/conversation/conversation-after-response-compaction.service';
import { ConversationMessagePlanningService } from '../../src/conversation/conversation-message-planning.service';
import { ContextGovernanceService } from '../../src/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/conversation/context-governance-settings.service';
import { ConversationMessageService } from '../../src/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../src/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../src/runtime/host/conversation-todo.service';
import { ConversationMessageLifecycleService } from '../../src/conversation/conversation-message-lifecycle.service';
import { ConversationTaskService } from '../../src/conversation/conversation-task.service';
import { RuntimeToolPermissionService } from '../../src/execution/runtime/runtime-tool-permission.service';
import type { PersonaService } from '../../src/persona/persona.service';

let activeConversationId = '';

describe('ConversationMessageLifecycleService', () => {
  const envKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const aiManagementService = {
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
    listProviders: jest.fn(),
  };
  const aiModelExecutionService = { generateText: jest.fn(), streamText: jest.fn() };
  const aiVisionService = { resolveImageText: jest.fn(), resolveMessageParts: jest.fn() };
  const toolRegistryService = {
    buildToolSet: jest.fn().mockResolvedValue(undefined),
    listAvailableTools: jest.fn().mockResolvedValue([]),
  };
  const runtimeHostPluginDispatchService = {
    invokeHook: jest.fn(),
    listPlugins: jest.fn().mockReturnValue([]),
  };
  const personaService = {
    readCurrentPersona: jest.fn(),
  };

  let conversationTaskService: ConversationTaskService;
  let conversationId: string;
  let settingsConfigPath: string;
  let contextGovernanceSettingsService: ContextGovernanceSettingsService;
  let contextGovernanceService: ContextGovernanceService;
  let storagePath: string;
  let conversationMessagePlanningService: ConversationMessagePlanningService;
  let runtimeHostConversationRecordService: ConversationStoreService;
  let runtimeHostConversationMessageService: ConversationMessageService;
  let runtimeHostConversationTodoService: ConversationTodoService;
  let service: ConversationMessageLifecycleService;

  beforeEach(() => {
    storagePath = path.join(
      os.tmpdir(),
      `conversation-message-lifecycle.service.spec-${Date.now()}-${Math.random()}.json`,
    );
    settingsConfigPath = path.join(
      os.tmpdir(),
      `settings-lifecycle.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env[envKey] = storagePath;
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsConfigPath;
    jest.clearAllMocks();
    aiManagementService.getDefaultProviderSelection.mockReset();
    aiManagementService.getProvider.mockReset();
    aiManagementService.getProviderModel.mockReset();
    aiManagementService.listProviders.mockReset();
    aiModelExecutionService.generateText.mockReset();
    aiModelExecutionService.streamText.mockReset();
    aiVisionService.resolveImageText.mockReset();
    aiVisionService.resolveMessageParts.mockReset();
    toolRegistryService.buildToolSet.mockReset();
    toolRegistryService.listAvailableTools.mockReset();
    runtimeHostPluginDispatchService.invokeHook.mockReset();
    runtimeHostPluginDispatchService.listPlugins.mockReset();
    personaService.readCurrentPersona.mockReset();
    aiVisionService.resolveMessageParts.mockImplementation(async (_conversationId, parts) => parts);
    aiManagementService.getDefaultProviderSelection.mockReturnValue({ modelId: 'gpt-5.4', providerId: 'openai', source: 'default' });
    aiManagementService.getProvider.mockReturnValue({ defaultModel: 'gpt-5.4', id: 'openai', models: ['gpt-5.4'] });
    aiManagementService.getProviderModel.mockReturnValue({ contextLength: 128 * 1024, id: 'gpt-5.4', providerId: 'openai' });
    aiManagementService.listProviders.mockReturnValue([{ id: 'openai' }]);
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: '压缩后的历史摘要',
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    toolRegistryService.listAvailableTools.mockResolvedValue([]);
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([]);
    runtimeHostConversationRecordService = new ConversationStoreService();
    runtimeHostConversationMessageService = new ConversationMessageService(
      runtimeHostConversationRecordService,
    );
    runtimeHostConversationTodoService = new ConversationTodoService(
      runtimeHostConversationRecordService,
    );
    conversationTaskService = new ConversationTaskService(
      runtimeHostConversationMessageService,
      runtimeHostConversationRecordService,
      new RuntimeToolPermissionService(),
      runtimeHostConversationTodoService,
    );
    contextGovernanceSettingsService = new ContextGovernanceSettingsService();
    contextGovernanceService = new ContextGovernanceService(
      aiManagementService as never,
      aiModelExecutionService as never,
      contextGovernanceSettingsService,
      runtimeHostConversationRecordService,
    );
    conversationMessagePlanningService = new ConversationMessagePlanningService(
      aiModelExecutionService as never,
      aiVisionService as never,
      new ConversationAfterResponseCompactionService(
        contextGovernanceService,
      ),
      contextGovernanceService,
      runtimeHostConversationRecordService,
      personaService as never,
      toolRegistryService as never,
      runtimeHostPluginDispatchService as never,
    );
    service = new ConversationMessageLifecycleService(
      runtimeHostConversationMessageService,
      runtimeHostConversationRecordService,
      conversationTaskService,
      conversationMessagePlanningService,
      personaService as never,
      runtimeHostPluginDispatchService as never,
    );
    conversationId = (runtimeHostConversationRecordService.createConversation({ title: 'Conversation conversation-1', userId: 'user-1' }) as { id: string }).id;
    activeConversationId = conversationId;
    personaService.readCurrentPersona.mockReturnValue({
      avatar: null,
      beginDialogs: [],
      createdAt: '2026-04-10T00:00:00.000Z',
      customErrorMessage: null,
      description: '默认人格',
      id: 'builtin.default-assistant',
      isDefault: true,
      name: 'Default Assistant',
      personaId: 'builtin.default-assistant',
      prompt: 'You are Garlic Claw.',
      source: 'default',
      toolNames: null,
      updatedAt: '2026-04-10T00:00:00.000Z',
    } satisfies ReturnType<PersonaService['readCurrentPersona']>);
  });

  afterEach(() => {
    delete process.env[envKey];
    delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      if (fs.existsSync(settingsConfigPath)) {
        fs.unlinkSync(settingsConfigPath);
      }
    } catch {
      // 忽略临时文件清理失败，避免影响测试主语义。
    }
  });

  it('uses ai model streaming instead of echoing the input back to the assistant message', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '真正的模型回复'));

    const started = await startAndWait(service, conversationTaskService, {
      content: '你好',
      model: 'gpt-5.4',
      provider: 'openai',
    });
    const events: unknown[] = [];
    conversationTaskService.subscribe(String(started.assistantMessage.id), (event) => events.push(event));

    expect(started.assistantMessage).toMatchObject({
      content: '',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'pending',
    });
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{ content: '你好', role: 'user' }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    expect(readConversation(runtimeHostConversationRecordService).messages.filter((message) => message.role !== 'display')).toMatchObject([
      { content: '你好', role: 'user', status: 'completed' },
      { content: '真正的模型回复', model: 'gpt-5.4', provider: 'openai', role: 'assistant', status: 'completed' },
    ]);
    expect(events).toEqual([]);
  });

  it('persists provider usage onto the assistant message and makes it available to the current conversation state', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('deepseek-v4-flash', 'ds2api', '真正的模型回复', {
      cachedInputTokens: 19,
      inputTokens: 321,
      outputTokens: 87,
      source: 'provider',
      totalTokens: 408,
    }));

    await startAndWait(service, conversationTaskService, {
      content: '你好',
      model: 'deepseek-v4-flash',
      provider: 'ds2api',
    });

    const assistantMessage = readConversation(runtimeHostConversationRecordService).messages[1];
    expect(JSON.parse(String(assistantMessage.metadataJson))).toEqual(expect.objectContaining({
      annotations: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            cachedInputTokens: 19,
            inputTokens: 321,
            modelId: 'deepseek-v4-flash',
            outputTokens: 87,
            providerId: 'ds2api',
            responseHistorySignature: expect.any(String),
            source: 'provider',
            totalTokens: 408,
          }),
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        }),
      ]),
    }));
  });

  it('can read context window preview after a real message lifecycle round', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        strategy: 'summary',
      },
    });
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '真正的模型回复'));

    await startAndWait(service, conversationTaskService, {
      content: '你好',
      model: 'gpt-5.4',
      provider: 'openai',
    });

    await expect(
      conversationMessagePlanningService.getContextWindowPreview({
        conversationId,
        modelId: 'gpt-5.4',
        providerId: 'openai',
        userId: 'user-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: true,
        frontendMessageWindowSize: 200,
        includedMessageIds: expect.arrayContaining([
          expect.any(String),
        ]),
        strategy: 'summary',
      }),
    );
  });

  it('appends vision fallback descriptions before sending image prompts to the model', async () => {
    aiVisionService.resolveMessageParts.mockResolvedValue([
      { text: '帮我看图', type: 'text' },
      { image: 'data:image/png;base64,AAAA', mimeType: 'image/png', type: 'image' },
      { text: '图片说明：图片里是一只猫', type: 'text' },
    ]);
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '这是一只猫'));

    const started = await startAndWait(service, conversationTaskService, {
      model: 'gpt-5.4',
      parts: [
        { text: '帮我看图', type: 'text' },
        { image: 'data:image/png;base64,AAAA', mimeType: 'image/png', type: 'image' },
      ],
      provider: 'openai',
    });

    expect(started.assistantMessage).toMatchObject({ content: '', role: 'assistant', status: 'pending' });
    expect(aiVisionService.resolveMessageParts).toHaveBeenCalledWith(conversationId, [
      { text: '帮我看图', type: 'text' },
      { image: 'data:image/png;base64,AAAA', mimeType: 'image/png', type: 'image' },
    ]);
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{
        content: [
          { text: '帮我看图', type: 'text' },
          { image: 'data:image/png;base64,AAAA', mimeType: 'image/png', type: 'image' },
          { text: '图片说明：图片里是一只猫', type: 'text' },
        ],
        role: 'user',
      }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
  });

  it('applies response hooks before persisting the assistant message and broadcasts after send', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '原始回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.response-recorder', ['response:before-send', 'response:after-send'])]);
    runtimeHostPluginDispatchService.invokeHook.mockImplementation(async ({ hookName, payload }: { hookName: string; payload: { assistantContent?: string } }) =>
      hookName === 'response:before-send'
        ? { action: 'mutate', assistantContent: 'hook 改写后的回复', assistantParts: [{ text: 'hook 改写后的回复', type: 'text' }] }
        : hookName === 'response:after-send'
          ? expect(payload).toEqual(expect.objectContaining({ assistantContent: 'hook 改写后的回复' }))
          : null,
    );

    const started = await startAndWait(service, conversationTaskService, { content: '你好', model: 'gpt-5.4', provider: 'openai' });

    expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
      content: 'hook 改写后的回复',
      role: 'assistant',
      status: 'completed',
    });
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(1, expect.objectContaining({ hookName: 'response:before-send', pluginId: 'builtin.response-recorder' }));
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(2, expect.objectContaining({ hookName: 'response:after-send', pluginId: 'builtin.response-recorder' }));
    expect(started.assistantMessage).toMatchObject({ role: 'assistant' });
  });

  it('runs response after-send only after the assistant message has been persisted', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.after-send-recorder', ['response:after-send'])]);
    runtimeHostPluginDispatchService.invokeHook.mockImplementation(async ({ hookName, payload }: { hookName: string; payload: { assistantContent?: string } }) => {
      if (hookName !== 'response:after-send') {
        return null;
      }
      expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
        content: '模型回复',
        role: 'assistant',
        status: 'completed',
      });
      expect(payload).toEqual(expect.objectContaining({ assistantContent: '模型回复' }));
      return null;
    });

    await startAndWait(service, conversationTaskService, { content: '你好', model: 'gpt-5.4', provider: 'openai' });
  });

  it('keeps the assistant message completed when response after-send hook fails', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.after-send-failure', ['response:after-send'])]);
    runtimeHostPluginDispatchService.invokeHook.mockImplementation(async ({ hookName }: { hookName: string }) => {
      if (hookName === 'response:after-send') {
        throw new Error('after-send hook failed');
      }
      return null;
    });

    await startAndWait(service, conversationTaskService, { content: '你好', model: 'gpt-5.4', provider: 'openai' });

    expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
      content: '模型回复',
      role: 'assistant',
      status: 'completed',
    });
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      hookName: 'response:after-send',
      pluginId: 'builtin.after-send-failure',
    }));
  });

  it('applies chat after-model hooks before response hooks', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型原始回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.after-model-recorder', ['chat:after-model', 'response:before-send'])]);
    runtimeHostPluginDispatchService.invokeHook.mockImplementation(async ({ hookName }: { hookName: string }) =>
      hookName === 'chat:after-model'
        ? { action: 'mutate', assistantContent: 'after-model 改写后的回复', assistantParts: [{ text: 'after-model 改写后的回复', type: 'text' }] }
        : { action: 'mutate', assistantContent: 'before-send 最终回复', assistantParts: [{ text: 'before-send 最终回复', type: 'text' }] },
    );

    await startAndWait(service, conversationTaskService, { content: '你好', model: 'gpt-5.4', provider: 'openai' });

    expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
      content: 'before-send 最终回复',
      role: 'assistant',
      status: 'completed',
    });
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(1, expect.objectContaining({ hookName: 'chat:after-model' }));
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(2, expect.objectContaining({ hookName: 'response:before-send' }));
  });

  it('applies message created hooks to the persisted user message before model execution', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.message-created-recorder', ['message:created'])]);
    runtimeHostPluginDispatchService.invokeHook.mockResolvedValue({ action: 'mutate', content: 'hook 改写后的用户消息' });

    await startAndWait(service, conversationTaskService, { content: '原始用户消息', model: 'gpt-5.4', provider: 'openai' });

    expect(readConversation(runtimeHostConversationRecordService).messages[0]).toMatchObject({
      content: 'hook 改写后的用户消息',
      role: 'user',
      status: 'completed',
    });
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{ content: 'hook 改写后的用户消息', role: 'user' }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
  });

  it('applies message received hooks before persisting the user message and selecting the model', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('claude-3-7-sonnet', 'anthropic', '模型回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.message-received-recorder', ['message:received'])]);
    runtimeHostPluginDispatchService.invokeHook.mockResolvedValue({
      action: 'mutate',
      content: 'hook 改写后的入站消息',
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    });

    await startAndWait(service, conversationTaskService, { content: '原始入站消息' });

    expect(readConversation(runtimeHostConversationRecordService).messages[0]).toMatchObject({ content: 'hook 改写后的入站消息', role: 'user' });
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{ content: 'hook 改写后的入站消息', role: 'user' }],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    });
  });

  it('blocks starting a second active assistant generation', async () => {
    runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'pending',
    });

    await expect(
      service.startMessageGeneration(conversationId, { content: '第二条消息', model: 'gpt-5.4', provider: 'openai' }, 'user-1'),
    ).rejects.toThrow('当前仍有回复在生成中，请先停止或等待完成');
  });

  it('blocks starting a second generation when a display result is still active', async () => {
    runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '命令执行中',
      metadata: {
        annotations: [
          {
            data: {
              variant: 'result',
            },
            owner: 'conversation.display-message',
            type: 'display-message',
            version: '1',
          },
        ],
      },
      role: 'display',
      status: 'pending',
    });

    await expect(
      service.startMessageGeneration(conversationId, { content: '第二条消息', model: 'gpt-5.4', provider: 'openai' }, 'user-1'),
    ).rejects.toThrow('当前仍有回复在生成中，请先停止或等待完成');
  });

  it('rejects retrying a non-assistant message', async () => {
    const userMessage = runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '普通用户消息',
      parts: [{ text: '普通用户消息', type: 'text' }],
      role: 'user',
      status: 'completed',
    });

    await expect(
      service.retryMessageGeneration(conversationId, String(userMessage.id), { model: 'gpt-5.4', provider: 'openai' }, 'user-1'),
    ).rejects.toThrow('Only assistant messages can be retried');
  });

  it('blocks retry when the conversation already has an active assistant reply', async () => {
    runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '已完成回复',
      model: 'gpt-5.4',
      parts: [{ text: '已完成回复', type: 'text' }],
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
    });
    const activeAssistantMessage = runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '',
      model: 'gpt-5.4',
      parts: [],
      provider: 'openai',
      role: 'assistant',
      status: 'pending',
    });

    await expect(
      service.retryMessageGeneration(conversationId, String(activeAssistantMessage.id), { model: 'gpt-5.4', provider: 'openai' }, 'user-1'),
    ).rejects.toThrow('当前仍有回复在生成中，请先停止或等待完成');
  });

  it('blocks retry when the conversation already has an active display result reply', async () => {
    runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '已完成回复',
      model: 'gpt-5.4',
      parts: [{ text: '已完成回复', type: 'text' }],
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
    });
    const assistantMessage = runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '可重试的回复',
      model: 'gpt-5.4',
      parts: [{ text: '可重试的回复', type: 'text' }],
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
    });
    runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '命令执行中',
      metadata: {
        annotations: [
          {
            data: {
              variant: 'result',
            },
            owner: 'conversation.display-message',
            type: 'display-message',
            version: '1',
          },
        ],
      },
      role: 'display',
      status: 'pending',
    });

    await expect(
      service.retryMessageGeneration(conversationId, String(assistantMessage.id), { model: 'gpt-5.4', provider: 'openai' }, 'user-1'),
    ).rejects.toThrow('当前仍有回复在生成中，请先停止或等待完成');
  });

  it('stops a display result message and writes back stopped when runtime task is already gone', async () => {
    const displayResultMessage = runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '命令执行中',
      metadata: {
        annotations: [
          {
            data: {
              variant: 'result',
            },
            owner: 'conversation.display-message',
            type: 'display-message',
            version: '1',
          },
        ],
      },
      role: 'display',
      status: 'pending',
    });

    await expect(
      service.stopMessageGeneration(conversationId, String(displayResultMessage.id), 'user-1'),
    ).resolves.toEqual({ message: 'Generation stopped' });

    expect(readConversation(runtimeHostConversationRecordService).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: String(displayResultMessage.id),
          role: 'display',
          status: 'stopped',
        }),
      ]),
    );
  });

  it('includes user and active persona in hook context payloads', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    runtimeHostConversationRecordService.rememberConversationActivePersona(conversationId, 'persona-1');
    personaService.readCurrentPersona.mockReturnValue({
      avatar: null,
      beginDialogs: [],
      createdAt: '2026-04-18T00:00:00.000Z',
      customErrorMessage: null,
      description: '上下文人格',
      id: 'persona-1',
      isDefault: false,
      name: 'Persona 1',
      personaId: 'persona-1',
      prompt: '你是 persona-1。',
      source: 'conversation',
      toolNames: null,
      updatedAt: '2026-04-18T00:00:00.000Z',
    });
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.before-model-recorder', ['chat:before-model'])]);
    runtimeHostPluginDispatchService.invokeHook.mockResolvedValue({ action: 'pass' });

    await startAndWait(service, conversationTaskService, { content: '原始模型输入' }, 'user-1');

    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        activePersonaId: 'persona-1',
        conversationId,
        userId: 'user-1',
      }),
    }));
  });

  it('applies chat before-model hooks before invoking the model', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('claude-3-7-sonnet', 'anthropic', '模型回复'));
    toolRegistryService.listAvailableTools.mockResolvedValue([
      { description: 'search memory', name: 'memory.search', parameters: {}, pluginId: 'builtin.memory', sourceId: 'builtin.memory', sourceKind: 'plugin' },
    ]);
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.before-model-recorder', ['chat:before-model'])]);
    runtimeHostPluginDispatchService.invokeHook.mockResolvedValue({
      action: 'mutate',
      messages: [{ content: 'hook 改写后的模型输入', role: 'user' }],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      systemPrompt: '你是新的系统提示词',
    });

    await startAndWait(service, conversationTaskService, { content: '原始模型输入' });

    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({ hookName: 'chat:before-model', pluginId: 'builtin.before-model-recorder' }));
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{ content: 'hook 改写后的模型输入', role: 'user' }],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      system: '你是新的系统提示词',
    });
  });

  it('runs conversation history rewrite before chat before-model and model execution', async () => {
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      {
        content: '旧历史消息',
        createdAt: '2026-04-19T09:00:00.000Z',
        id: 'history-user-1',
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-19T09:00:00.000Z',
      },
    ]);
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([
      plugin('builtin.history-rewrite', ['conversation:history-rewrite']),
      plugin('builtin.before-model-recorder', ['chat:before-model']),
    ]);
    runtimeHostPluginDispatchService.invokeHook.mockImplementation(async ({
      hookName,
      payload,
    }: {
      hookName: string;
      payload: {
        conversationId?: string;
        history?: {
          revision: string;
          messages: Array<Record<string, unknown>>;
        };
      };
    }) => {
      if (hookName === 'conversation:history-rewrite') {
        const latestUserMessage = [...(payload.history?.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'user');
        const pendingAssistantMessage = [...(payload.history?.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'assistant' && message.status === 'pending');
        expect(payload.history?.revision).toEqual(expect.any(String));
        expect(latestUserMessage).toBeTruthy();
        expect(pendingAssistantMessage).toBeTruthy();
        runtimeHostConversationRecordService.replaceConversationHistory(conversationId, {
          expectedRevision: payload.history!.revision,
          messages: [
            {
              content: '压缩后的历史摘要',
              createdAt: '2026-04-19T09:05:00.000Z',
              id: 'history-summary-1',
              parts: [
                {
                  text: '压缩后的历史摘要',
                  type: 'text',
                },
              ],
              role: 'assistant',
              status: 'completed',
              updatedAt: '2026-04-19T09:05:00.000Z',
            },
            latestUserMessage as never,
            pendingAssistantMessage as never,
          ],
        });
        return { action: 'pass' };
      }
      return { action: 'pass' };
    });

    await startAndWait(service, conversationTaskService, {
      content: '新的用户问题',
      model: 'gpt-5.4',
      provider: 'openai',
    });

    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(1, expect.objectContaining({
      hookName: 'conversation:history-rewrite',
      pluginId: 'builtin.history-rewrite',
    }));
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenNthCalledWith(2, expect.objectContaining({
      hookName: 'chat:before-model',
      pluginId: 'builtin.before-model-recorder',
    }));
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
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
        { content: '新的用户问题', role: 'user' },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
  });

  it('injects persona prompt and begin dialogs before model execution', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    personaService.readCurrentPersona.mockReturnValue({
      avatar: null,
      beginDialogs: [
        { content: '你先说明推理框架。', role: 'assistant' },
        { content: '我会先说明框架。', role: 'user' },
      ],
      createdAt: '2026-04-18T00:00:00.000Z',
      customErrorMessage: null,
      description: '分析人格',
      id: 'persona.analyst',
      isDefault: false,
      name: 'Analyst',
      personaId: 'persona.analyst',
      prompt: '你是一个分析型助手。',
      source: 'conversation',
      toolNames: null,
      updatedAt: '2026-04-18T00:00:00.000Z',
    });

    await startAndWait(service, conversationTaskService, {
      content: '给我总结一下',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1');

    expect(aiModelExecutionService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        { content: '你先说明推理框架。', role: 'assistant' },
        { content: '我会先说明框架。', role: 'user' },
        { content: '给我总结一下', role: 'user' },
      ],
      system: '你是一个分析型助手。',
    }));
  });

  it('applies persona tool restrictions to tool selection', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '模型回复'));
    personaService.readCurrentPersona.mockReturnValue({
      avatar: null,
      beginDialogs: [],
      createdAt: '2026-04-18T00:00:00.000Z',
      customErrorMessage: null,
      description: '分析人格',
      id: 'persona.analyst',
      isDefault: false,
      name: 'Analyst',
      personaId: 'persona.analyst',
      prompt: '你是一个分析型助手。',
      source: 'conversation',
      toolNames: ['memory.search'],
      updatedAt: '2026-04-18T00:00:00.000Z',
    });

    await startAndWait(service, conversationTaskService, {
      content: '给我总结一下',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1');

    expect(toolRegistryService.buildToolSet).toHaveBeenCalledWith(expect.objectContaining({
      allowedToolNames: ['memory.search'],
    }));
  });

  it('uses persona custom error messages when model execution fails', async () => {
    aiModelExecutionService.streamText.mockImplementation(() => {
      throw new Error('provider timeout')
    })
    personaService.readCurrentPersona.mockReturnValue({
      avatar: null,
      beginDialogs: [],
      createdAt: '2026-04-18T00:00:00.000Z',
      customErrorMessage: '当前人格暂时无法完成请求。',
      description: '分析人格',
      id: 'persona.analyst',
      isDefault: false,
      name: 'Analyst',
      personaId: 'persona.analyst',
      prompt: '你是一个分析型助手。',
      source: 'conversation',
      toolNames: null,
      updatedAt: '2026-04-18T00:00:00.000Z',
    })

    const started = await startAndWait(service, conversationTaskService, {
      content: '给我总结一下',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1')

    expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
      error: '当前人格暂时无法完成请求。',
      role: 'assistant',
      status: 'error',
    })
    expect(started.assistantMessage).toMatchObject({ role: 'assistant' })
  })

  it('keeps the conversation mainline alive when the provider stream fails after starting', async () => {
    const streamFailure = new Error('invalid x-api-key')
    const rejectingFinishReason = Promise.reject(streamFailure)
    const rejectingUsage = Promise.reject(streamFailure)
    rejectingFinishReason.catch(() => undefined)
    rejectingUsage.catch(() => undefined)
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: rejectingFinishReason,
      fullStream: (async function* () {
        yield { text: '部分输出', type: 'text-delta' as const }
        throw streamFailure
      })(),
      modelId: 'claude-3-5-sonnet-20241022',
      providerId: 'anthropic',
      usage: rejectingUsage,
    })

    const started = await startAndWait(service, conversationTaskService, {
      content: '你好',
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
    })

    expect(readConversation(runtimeHostConversationRecordService).messages).toMatchObject([
      { content: '你好', role: 'user', status: 'completed' },
      {
        content: '部分输出',
        error: 'invalid x-api-key',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        role: 'assistant',
        status: 'error',
      },
    ])
    expect(started.assistantMessage).toMatchObject({ role: 'assistant' })
  })

  it('does not auto-continue after after-response compaction when the completed reply has no tool activity', async () => {
    jest.spyOn(conversationMessagePlanningService, 'broadcastAfterSend')
      .mockResolvedValueOnce({ compactionTriggered: true })
      .mockResolvedValue({ compactionTriggered: false })
    aiModelExecutionService.streamText.mockReturnValueOnce(streamed('gpt-5.4', 'openai', '第一轮先完成这里，再继续后续步骤。'))

    const started = await startAndWait(service, conversationTaskService, {
      content: '请先完成第一步，然后继续后续步骤。',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1')

    await waitForConversationToSettle(conversationTaskService, runtimeHostConversationRecordService)

    const messages = readConversation(runtimeHostConversationRecordService).messages
    const syntheticContinueMessage = messages.find(hasContextCompactionContinueAnnotation)

    expect(started.assistantMessage).toMatchObject({ role: 'assistant' })
    expect(conversationMessagePlanningService.broadcastAfterSend).toHaveBeenCalledTimes(1)
    expect(aiModelExecutionService.streamText).toHaveBeenCalledTimes(1)
    expect(syntheticContinueMessage).toBeUndefined()
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: '第一轮先完成这里，再继续后续步骤。',
        role: 'assistant',
        status: 'completed',
      }),
    ]))
  })

  it('does not auto-continue after after-response compaction when the completed reply already includes final assistant text', async () => {
    jest.spyOn(conversationMessagePlanningService, 'broadcastAfterSend')
      .mockResolvedValueOnce({ compactionTriggered: true })
      .mockResolvedValue({ compactionTriggered: false })
    aiModelExecutionService.streamText.mockReturnValueOnce(
      streamedWithToolActivity('gpt-5.4', 'openai', '第一轮先调用工具，再继续后续步骤。'),
    )

    const started = await startAndWait(service, conversationTaskService, {
      content: '请先调用工具，再继续后续步骤。',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1')

    await waitForConversationToSettle(conversationTaskService, runtimeHostConversationRecordService)

    const messages = readConversation(runtimeHostConversationRecordService).messages
    const syntheticContinueMessage = messages.find((message) => (
      message.role === 'user'
      && message.content === 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.'
      && hasContextCompactionContinueAnnotation(message)
    ))

    expect(started.assistantMessage).toMatchObject({ role: 'assistant' })
    expect(conversationMessagePlanningService.broadcastAfterSend).toHaveBeenCalledTimes(1)
    expect(aiModelExecutionService.streamText).toHaveBeenCalledTimes(1)
    expect(syntheticContinueMessage).toBeUndefined()
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: '第一轮先调用工具，再继续后续步骤。',
        role: 'assistant',
        status: 'completed',
      }),
    ]))
  })

  it('auto-continues after after-response compaction only when the completed reply has tool activity and no final assistant text', async () => {
    jest.spyOn(conversationMessagePlanningService, 'broadcastAfterSend')
      .mockResolvedValueOnce({ compactionTriggered: true })
      .mockResolvedValue({ compactionTriggered: false })
    aiModelExecutionService.streamText
      .mockReturnValueOnce(streamedWithToolActivity('gpt-5.4', 'openai', ''))
      .mockReturnValueOnce(streamed('gpt-5.4', 'openai', '压缩后已自动继续执行，下面是后续步骤。'))

    const started = await startAndWait(service, conversationTaskService, {
      content: '请先调用工具，再继续后续步骤。',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1')

    await waitForConversationToSettle(conversationTaskService, runtimeHostConversationRecordService)

    const messages = readConversation(runtimeHostConversationRecordService).messages
    const syntheticContinueMessage = messages.find((message) => (
      message.role === 'user'
      && message.content === 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.'
      && hasContextCompactionContinueAnnotation(message)
    ))

    expect(started.assistantMessage).toMatchObject({ role: 'assistant' })
    expect(conversationMessagePlanningService.broadcastAfterSend).toHaveBeenCalledTimes(2)
    expect(aiModelExecutionService.streamText).toHaveBeenCalledTimes(2)
    expect(syntheticContinueMessage).toBeTruthy()
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: '',
        role: 'assistant',
        status: 'completed',
      }),
      expect.objectContaining({
        content: '压缩后已自动继续执行，下面是后续步骤。',
        role: 'assistant',
        status: 'completed',
      }),
    ]))
    expect(aiModelExecutionService.streamText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      allowFallbackChatModels: true,
      messages: expect.arrayContaining([
        {
          content: [
            {
              text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
              type: 'text',
            },
          ],
          role: 'user',
        },
      ]),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    }))
  })

  it('marks the assistant message as error when pre-model auto compaction still cannot fit the context', async () => {
    aiManagementService.getProviderModel.mockReturnValue({
      contextLength: 256,
      id: 'gpt-5.4',
      providerId: 'openai',
    })
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 6,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    })
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('history-1', 'user', '请直接写一篇超长文章。'),
      createHistoryMessage('assistant-final', 'assistant', '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300)),
    ])
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '不应触发的模型回复'))

    await conversationMessagePlanningService.broadcastAfterSend(
      { conversationId, userId: 'user-1' },
      {
        assistantMessageId: 'assistant-final',
        content: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300),
        continuationState: {
          hasAssistantTextOutput: true,
          hasToolActivity: false,
        },
        conversationId,
        modelId: 'gpt-5.4',
        parts: [{ text: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300), type: 'text' }],
        providerId: 'openai',
        toolCalls: [],
        toolResults: [],
      },
      'model',
    )

    await startAndWait(service, conversationTaskService, {
      content: '继续',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1')

    const messages = readConversation(runtimeHostConversationRecordService).messages
    const latestAssistant = messages.at(-1)

    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled()
    expect(messages.filter((message) => message.role === 'display')).toHaveLength(0)
    expect(latestAssistant).toMatchObject({
      content: '',
      error: expect.stringContaining('压缩后的上下文仍超过预算'),
      role: 'assistant',
      status: 'error',
    })
  })

  it('short-circuits the conversation mainline for internal context governance commands', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 1,
        strategy: 'summary',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('history-1', 'user', '第一条历史消息'),
      createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
      createHistoryMessage('history-3', 'user', '第三条历史追问'),
    ]);

    const started = await startAndWait(service, conversationTaskService, { content: '/compact' }, 'user-1');
    const displayMessages = readConversation(runtimeHostConversationRecordService).messages
      .filter((message) => message.role === 'display');

    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled();
    expect(displayMessages).toMatchObject([
      {
        content: '/compact',
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                variant: 'command',
              },
              owner: 'conversation.display-message',
              type: 'display-message',
              version: '1',
            },
          ],
        }),
        role: 'display',
        status: 'completed',
      },
      {
        content: '已压缩上下文，覆盖 2 条历史消息。',
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                variant: 'result',
              },
              owner: 'conversation.display-message',
              type: 'display-message',
              version: '1',
            },
          ],
        }),
        role: 'display',
        status: 'completed',
      },
      {
        content: '压缩后的历史摘要',
        role: 'display',
        status: 'completed',
      },
    ]);
    expect(started.userMessage).toMatchObject({ role: 'display' });
    expect(started.assistantMessage).toMatchObject({ role: 'display' });
  });

  it('renders compaction summary after the command result in display chronology', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 1,
        strategy: 'summary',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('history-1', 'user', '第一条历史消息'),
      createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
      createHistoryMessage('history-3', 'user', '第三条历史追问'),
    ]);

    await startAndWait(service, conversationTaskService, { content: '/compact' }, 'user-1');

    const displayMessages = readConversation(runtimeHostConversationRecordService).messages
      .filter((message) => message.role === 'display');

    expect(displayMessages.map((message) => message.content)).toEqual([
      '/compact',
      '已压缩上下文，覆盖 2 条历史消息。',
      '压缩后的历史摘要',
    ]);
  });

  it('keeps earlier internal command display messages out of later compaction coverage', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 1,
        strategy: 'summary',
      },
    });
    runtimeHostConversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('history-1', 'user', '第一条历史消息'),
      createHistoryMessage('history-2', 'assistant', '第二条历史回复'),
      createHistoryMessage('history-3', 'user', '第三条历史追问'),
    ]);

    await startAndWait(service, conversationTaskService, { content: '/compact' }, 'user-1');
    await startAndWait(service, conversationTaskService, { content: '/compress' }, 'user-1');

    const displayMessages = readConversation(runtimeHostConversationRecordService).messages
      .filter((message) => message.role === 'display');
    const commandAndResultMessages = displayMessages.filter(isDisplayCommandOrResultMessage);

    expect(commandAndResultMessages.map((message) => message.content)).toEqual([
      '/compact',
      expect.stringMatching(/^已/),
      '/compress',
      expect.stringMatching(/^已/),
    ]);
    expect(commandAndResultMessages[0]).not.toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                role: 'covered',
              }),
              owner: 'conversation.context-governance',
              type: 'context-compaction',
            }),
          ]),
        }),
      }),
    );
    expect(commandAndResultMessages[1]).not.toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                role: 'covered',
              }),
              owner: 'conversation.context-governance',
              type: 'context-compaction',
            }),
          ]),
        }),
      }),
    );
  });

  it('does not downgrade unknown slash text to display messages', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '常规模型回复'));

    const started = await startAndWait(service, conversationTaskService, {
      content: '/unknown test',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1');

    expect(readConversation(runtimeHostConversationRecordService).messages.filter((message) => message.role !== 'display')).toMatchObject([
      {
        content: '/unknown test',
        role: 'user',
        status: 'completed',
      },
      {
        content: '常规模型回复',
        role: 'assistant',
        status: 'completed',
      },
    ]);
    expect(started.userMessage).toMatchObject({ role: 'user' });
    expect(started.assistantMessage).toMatchObject({ role: 'assistant' });
    expectStreamInput(aiModelExecutionService.streamText, {
      allowFallbackChatModels: true,
      messages: [{ content: '/unknown test', role: 'user' }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
  });

  it('short-circuits model execution when chat before-model returns an assistant response', async () => {
    runtimeHostPluginDispatchService.listPlugins.mockReturnValue([plugin('builtin.before-model-short-circuit', ['chat:before-model'])]);
    runtimeHostPluginDispatchService.invokeHook.mockResolvedValue({
      action: 'short-circuit',
      assistantContent: 'hook 直接返回的回复',
      assistantParts: [{ text: 'hook 直接返回的回复', type: 'text' }],
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    });

    await startAndWait(service, conversationTaskService, { content: '原始模型输入' });

    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled();
    expect(readConversation(runtimeHostConversationRecordService).messages[1]).toMatchObject({
      content: 'hook 直接返回的回复',
      model: 'claude-3-7-sonnet',
      provider: 'anthropic',
      role: 'assistant',
      status: 'completed',
    });
  });
});

function expectStreamInput(streamText: jest.Mock, expected: Record<string, unknown>) {
  expect(streamText).toHaveBeenCalledWith(expect.objectContaining(expected));
}

function plugin(id: string, hookNames: string[]) {
  return {
    connected: true,
    conversationScopes: {},
    defaultEnabled: true,
    manifest: { hooks: hookNames.map((name) => ({ name })), id },
    pluginId: id,
  };
}

function readConversation(runtimeHostConversationRecordService: ConversationStoreService) {
  return runtimeHostConversationRecordService.requireConversation(
    activeConversationId,
  );
}

async function startAndWait(
  service: ConversationMessageLifecycleService,
  conversationTaskService: ConversationTaskService,
  dto: { content?: string; model?: string; parts?: ChatMessagePart[]; provider?: string },
  userId?: string,
) {
  const started = await service.startMessageGeneration(activeConversationId, dto, userId);
  await conversationTaskService.waitForTask(String(started.assistantMessage.id));
  return started;
}

function streamed(
  modelId: string,
  providerId: string,
  text: string,
  usage?: {
    cachedInputTokens?: number;
    inputTokens: number;
    outputTokens: number;
    source: 'estimated' | 'provider';
    totalTokens: number;
  },
) {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream: (async function* () {
      yield { text, type: 'text-delta' };
    })(),
    modelId,
    providerId,
    ...(usage ? { usage: Promise.resolve(usage) } : {}),
  };
}

function streamedWithToolActivity(
  modelId: string,
  providerId: string,
  text: string,
) {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream: (async function* () {
      yield { input: { content: '自动续跑验证' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-call' };
      yield { output: { kind: 'tool:text', value: '保存完成' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-result' };
      yield { text, type: 'text-delta' };
    })(),
    modelId,
    providerId,
  };
}

function createHistoryMessage(id: string, role: 'assistant' | 'user', content: string) {
  return {
    content,
    createdAt: '2026-04-25T00:00:00.000Z',
    id,
    parts: [{ text: content, type: 'text' as const }],
    role,
    status: 'completed',
    updatedAt: '2026-04-25T00:00:00.000Z',
  };
}

function isDisplayCommandOrResultMessage(message: Record<string, unknown>) {
  const annotations = readMessageAnnotations(message);
  return annotations.some((annotation) => (
      annotation?.type === 'display-message'
      && annotation?.owner === 'conversation.display-message'
      && isRecord(annotation?.data)
      && (annotation.data.variant === 'command' || annotation.data.variant === 'result')
    ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessageAnnotations(message: Record<string, unknown>): Array<Record<string, unknown>> {
  const metadataJson = message.metadataJson;
  if (typeof metadataJson === 'string') {
    try {
      const parsed = JSON.parse(metadataJson) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.annotations)) {
        return parsed.annotations.filter(isRecord);
      }
    } catch {
      return [];
    }
  }

  const metadata = isRecord(message.metadata) ? message.metadata : null;
  return Array.isArray(metadata?.annotations)
    ? metadata.annotations.filter(isRecord)
    : [];
}

function hasContextCompactionContinueAnnotation(message: Record<string, unknown>): boolean {
  return readMessageAnnotations(message).some((annotation) => (
    annotation.owner === 'conversation.context-governance'
    && annotation.type === 'context-compaction'
    && isRecord(annotation.data)
    && annotation.data.role === 'continue'
    && annotation.data.synthetic === true
  ));
}

async function waitForConversationToSettle(
  conversationTaskService: ConversationTaskService,
  runtimeHostConversationRecordService: ConversationStoreService,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const conversation = readConversation(runtimeHostConversationRecordService);
    const activeAssistant = [...conversation.messages].reverse().find((message) => (
      message.role === 'assistant'
      && (message.status === 'pending' || message.status === 'streaming')
    ));
    if (activeAssistant?.id) {
      await conversationTaskService.waitForTask(String(activeAssistant.id));
      continue;
    }
    const lastMessage = conversation.messages.at(-1);
    if (lastMessage && hasContextCompactionContinueAnnotation(lastMessage)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const refreshedConversation = readConversation(runtimeHostConversationRecordService);
    const refreshedActiveAssistant = [...refreshedConversation.messages].reverse().find((message) => (
      message.role === 'assistant'
      && (message.status === 'pending' || message.status === 'streaming')
    ));
    if (!refreshedActiveAssistant?.id) {
      return;
    }
    await conversationTaskService.waitForTask(String(refreshedActiveAssistant.id));
  }
  throw new Error('等待自动续跑稳定超时');
}
