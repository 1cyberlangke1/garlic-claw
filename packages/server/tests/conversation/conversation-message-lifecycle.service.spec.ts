import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ChatMessagePart } from '@garlic-claw/shared';
import { ConversationMessagePlanningService } from '../../src/conversation/conversation-message-planning.service';
import { ContextGovernanceService } from '../../src/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/conversation/context-governance-settings.service';
import { RuntimeHostConversationMessageService } from '../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostConversationTodoService } from '../../src/runtime/host/runtime-host-conversation-todo.service';
import { RuntimeHostUserContextService } from '../../src/runtime/host/runtime-host-user-context.service';
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
  let contextGovernanceConfigPath: string;
  let contextGovernanceSettingsService: ContextGovernanceSettingsService;
  let storagePath: string;
  let conversationMessagePlanningService: ConversationMessagePlanningService;
  let runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  let runtimeHostConversationMessageService: RuntimeHostConversationMessageService;
  let runtimeHostConversationTodoService: RuntimeHostConversationTodoService;
  let service: ConversationMessageLifecycleService;

  beforeEach(() => {
    storagePath = path.join(
      os.tmpdir(),
      `conversation-message-lifecycle.service.spec-${Date.now()}-${Math.random()}.json`,
    );
    contextGovernanceConfigPath = path.join(
      os.tmpdir(),
      `context-governance-lifecycle.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env[envKey] = storagePath;
    process.env.GARLIC_CLAW_CONTEXT_GOVERNANCE_CONFIG_PATH = contextGovernanceConfigPath;
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
    runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
    runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
      runtimeHostConversationRecordService,
    );
    runtimeHostConversationTodoService = new RuntimeHostConversationTodoService(
      runtimeHostConversationRecordService,
    );
    conversationTaskService = new ConversationTaskService(
      runtimeHostConversationMessageService,
      new RuntimeToolPermissionService(),
      runtimeHostConversationTodoService,
    );
    contextGovernanceSettingsService = new ContextGovernanceSettingsService();
    conversationMessagePlanningService = new ConversationMessagePlanningService(
      aiModelExecutionService as never,
      aiVisionService as never,
      new ContextGovernanceService(
        aiManagementService as never,
        aiModelExecutionService as never,
        contextGovernanceSettingsService,
        runtimeHostConversationRecordService,
        new RuntimeHostUserContextService(),
      ),
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
    delete process.env.GARLIC_CLAW_CONTEXT_GOVERNANCE_CONFIG_PATH;
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      if (fs.existsSync(contextGovernanceConfigPath)) {
        fs.unlinkSync(contextGovernanceConfigPath);
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
    expect(readConversation(runtimeHostConversationRecordService).messages).toMatchObject([
      { content: '你好', role: 'user', status: 'completed' },
      { content: '真正的模型回复', model: 'gpt-5.4', provider: 'openai', role: 'assistant', status: 'completed' },
    ]);
    expect(events).toEqual([]);
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

  it('blocks generation when conversation host services disable session or llm', async () => {
    runtimeHostConversationRecordService.writeConversationHostServices(conversationId, { llmEnabled: false, sessionEnabled: false });

    await expect(
      service.startMessageGeneration(conversationId, { content: '你好' }, 'user-1'),
    ).rejects.toThrow('当前会话宿主服务已停用');
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
      { description: 'search memory', name: 'memory.search', parameters: {}, pluginId: 'builtin.memory-context', sourceId: 'builtin.memory-context', sourceKind: 'plugin' },
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
        { content: [], role: 'user' },
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
    const tailMessages = readConversation(runtimeHostConversationRecordService).messages.slice(-2);

    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled();
    expect(tailMessages).toMatchObject([
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
    ]);
    expect(started.userMessage).toMatchObject({ role: 'display' });
    expect(started.assistantMessage).toMatchObject({ role: 'display' });
  });

  it('still allows internal context governance commands when llm auto reply is turned off', async () => {
    runtimeHostConversationRecordService.writeConversationHostServices(conversationId, {
      llmEnabled: false,
      sessionEnabled: true,
    });
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

    await expect(
      startAndWait(service, conversationTaskService, { content: '/compress' }, 'user-1'),
    ).resolves.toMatchObject({
      assistantMessage: expect.objectContaining({
        role: 'display',
      }),
      userMessage: expect.objectContaining({
        role: 'display',
      }),
    });
    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled();
  });

  it('does not downgrade unknown slash text to display messages', async () => {
    aiModelExecutionService.streamText.mockReturnValue(streamed('gpt-5.4', 'openai', '常规模型回复'));

    const started = await startAndWait(service, conversationTaskService, {
      content: '/unknown test',
      model: 'gpt-5.4',
      provider: 'openai',
    }, 'user-1');

    expect(readConversation(runtimeHostConversationRecordService).messages).toMatchObject([
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

function readConversation(runtimeHostConversationRecordService: RuntimeHostConversationRecordService) {
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

function streamed(modelId: string, providerId: string, text: string) {
  return {
    finishReason: Promise.resolve('stop'),
    fullStream: (async function* () {
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
