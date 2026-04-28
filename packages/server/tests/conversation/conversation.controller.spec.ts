import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConversationController } from '../../src/adapters/http/conversation/conversation.controller';

describe('ConversationController', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const assistantMessageId = '22222222-2222-4222-8222-222222222222';
  const conversationMessagePlanningService = { getContextWindowPreview: jest.fn() };
  const conversationMessageLifecycleService = { retryMessageGeneration: jest.fn(), startMessageGeneration: jest.fn(), stopMessageGeneration: jest.fn() };
  const conversationTaskService = { stopTask: jest.fn(), subscribe: jest.fn(), waitForTask: jest.fn() };
  const runtimeToolPermissionService = { listPendingRequests: jest.fn(), reply: jest.fn() };
  const runtimeHostConversationMessageService = { deleteMessage: jest.fn(), updateMessage: jest.fn() };
  const runtimeHostConversationTodoService = { deleteSessionTodo: jest.fn(), readSessionTodo: jest.fn(), replaceSessionTodo: jest.fn() };
  const runtimeHostConversationRecordService = {
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    getConversation: jest.fn(),
    listConversations: jest.fn(),
    readConversationHostServices: jest.fn(),
    requireConversation: jest.fn(),
    writeConversationHostServices: jest.fn(),
  };
  let controller: ConversationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ConversationController(
      conversationMessagePlanningService as never,
      conversationMessageLifecycleService as never,
      conversationTaskService as never,
      runtimeToolPermissionService as never,
      runtimeHostConversationMessageService as never,
      runtimeHostConversationRecordService as never,
      runtimeHostConversationTodoService as never,
    );
  });

  it('marks chat routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ConversationController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('keeps UUID route param validation on conversation and message routes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/adapters/http/conversation/conversation.controller.ts'),
      'utf8',
    );

    expect(source).toContain("@Get('conversations/:id')");
    expect(source).toContain("const routeUuidPipe = new ParseUUIDPipe({ version: '7' });");
    expect(source).toContain("@Param('id', routeUuidPipe) id: string");
    expect(source).toContain("@Patch('conversations/:id/messages/:messageId')");
    expect(source).toContain("@Param('messageId', routeUuidPipe) messageId: string");
  });

  it('creates, lists, reads and deletes conversations through user-owned conversation APIs', async () => {
    const overview = { _count: { messages: 0 }, createdAt: '2026-04-11T00:00:00.000Z', id: conversationId, title: 'New Chat', updatedAt: '2026-04-11T00:00:00.000Z' };
    runtimeHostConversationRecordService.createConversation.mockReturnValue(overview);
    runtimeHostConversationRecordService.listConversations.mockReturnValue([overview]);
    runtimeHostConversationRecordService.getConversation.mockReturnValue({ ...overview, messages: [] });
    runtimeHostConversationRecordService.deleteConversation.mockResolvedValue({ message: 'Conversation deleted' });

    expect(controller.createConversation('user-1', { title: 'New Chat' } as never)).toEqual(overview);
    expect(runtimeHostConversationRecordService.createConversation).toHaveBeenCalledWith({ title: 'New Chat', userId: 'user-1' });
    expect(controller.listConversations('user-1')).toEqual([overview]);
    expect(runtimeHostConversationRecordService.listConversations).toHaveBeenCalledWith('user-1');
    expect(controller.getConversation('user-1', conversationId)).toEqual({ ...overview, messages: [] });
    expect(runtimeHostConversationRecordService.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    await expect(controller.deleteConversation('user-1', conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(runtimeHostConversationTodoService.deleteSessionTodo).toHaveBeenCalledWith(conversationId);
    expect(runtimeHostConversationRecordService.deleteConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(runtimeHostConversationRecordService.requireConversation.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeHostConversationTodoService.deleteSessionTodo.mock.invocationCallOrder[0],
    );
    expect(runtimeHostConversationTodoService.deleteSessionTodo.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeHostConversationRecordService.deleteConversation.mock.invocationCallOrder[0],
    );
  });

  it('reads conversation context window through owned conversation APIs', async () => {
    const preview = {
      enabled: true,
      estimatedTokens: 120,
      excludedMessageIds: ['message-1'],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['message-2', 'message-3'],
      keepRecentMessages: 2,
      maxWindowTokens: 256,
      slidingWindowUsagePercent: 50,
      strategy: 'sliding' as const,
    };
    conversationMessagePlanningService.getContextWindowPreview.mockResolvedValue(preview);

    await expect(controller.getConversationContextWindow('user-1', conversationId, 'openai', 'gpt-5.4')).resolves.toEqual(preview);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationMessagePlanningService.getContextWindowPreview).toHaveBeenCalledWith({
      conversationId,
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });
  });

  it('reads and updates conversation services through owned conversation APIs', () => {
    runtimeHostConversationRecordService.readConversationHostServices.mockReturnValue({ llmEnabled: false, sessionEnabled: true, ttsEnabled: true });
    runtimeHostConversationRecordService.writeConversationHostServices.mockReturnValue({ llmEnabled: true, sessionEnabled: true, ttsEnabled: false });

    expect(controller.getConversationHostServices('user-1', conversationId)).toEqual({ llmEnabled: false, sessionEnabled: true, ttsEnabled: true });
    expect(runtimeHostConversationRecordService.readConversationHostServices).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.updateConversationHostServices('user-1', conversationId, { ttsEnabled: false } as never)).toEqual({ llmEnabled: true, sessionEnabled: true, ttsEnabled: false });
    expect(runtimeHostConversationRecordService.writeConversationHostServices).toHaveBeenCalledWith(conversationId, { ttsEnabled: false }, 'user-1');
  });

  it('reads and updates session todo through owned conversation APIs', () => {
    const todos = [{ content: '实现 todo 工具', priority: 'high', status: 'in_progress' }];
    runtimeHostConversationTodoService.readSessionTodo.mockReturnValue(todos);
    runtimeHostConversationTodoService.replaceSessionTodo.mockReturnValue(todos);

    expect(controller.getSessionTodo('user-1', conversationId)).toEqual(todos);
    expect(runtimeHostConversationTodoService.readSessionTodo).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.updateSessionTodo('user-1', conversationId, { todos } as never)).toEqual(todos);
    expect(runtimeHostConversationTodoService.replaceSessionTodo).toHaveBeenCalledWith(conversationId, todos, 'user-1');
  });

  it('lists and replies runtime permission requests through owned conversation APIs', () => {
    const pending = [
      {
        backendKind: 'just-bash',
        operations: ['command.execute'],
        conversationId,
        createdAt: '2026-04-20T00:00:00.000Z',
        id: 'permission-1',
        summary: '执行 bash 命令',
        toolName: 'bash',
      },
    ];
    runtimeToolPermissionService.listPendingRequests.mockReturnValue(pending);
    runtimeToolPermissionService.reply.mockReturnValue({
      requestId: 'permission-1',
      resolution: 'approved',
    });

    expect(controller.listPendingRuntimePermissions('user-1', conversationId)).toEqual(pending);
    expect(runtimeToolPermissionService.listPendingRequests).toHaveBeenCalledWith(conversationId);
    expect(controller.replyRuntimePermission('user-1', conversationId, 'permission-1', { decision: 'always' } as never)).toEqual({
      requestId: 'permission-1',
      resolution: 'approved',
    });
    expect(runtimeToolPermissionService.reply).toHaveBeenCalledWith(conversationId, 'permission-1', 'always');
  });

  it('streams message-start and task events over SSE for sendMessage', async () => {
    const response = createResponseStub();
    let subscriber: ((event: { type: string }) => void) | null = null;
    const sendDto = { content: '你好', model: 'gpt-5.4', parts: [{ text: '你好', type: 'text' as const }], provider: 'openai' };
    const started = { assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' }, userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' } };
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue(started);
    conversationTaskService.subscribe.mockImplementation((_id: string, listener: (event: { type: string }) => void) => (subscriber = listener, jest.fn()));
    conversationTaskService.waitForTask.mockImplementation(async () => {
      subscriber?.({ messageId: assistantMessageId, status: 'streaming', type: 'status' } as never);
      subscriber?.({ messageId: assistantMessageId, text: '你好', type: 'text-delta' } as never);
      subscriber?.({ messageId: assistantMessageId, status: 'completed', type: 'finish' } as never);
    });

    await controller.sendMessage('user-1', conversationId, sendDto as never, response as never);

    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationMessageLifecycleService.startMessageGeneration).toHaveBeenCalledWith(conversationId, sendDto, 'user-1');
    expect(response.write).toHaveBeenNthCalledWith(1, sse({ assistantMessage: started.assistantMessage, type: 'message-start', userMessage: started.userMessage }));
    expect(response.write).toHaveBeenCalledWith(sse({ messageId: assistantMessageId, text: '你好', type: 'text-delta' }));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('unsubscribes the active task listener when SSE closes', async () => {
    const response = createResponseStub();
    let closeHandler: (() => void) | undefined;
    const unsubscribe = jest.fn();
    response.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
    });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' },
      userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' },
    });
    conversationTaskService.subscribe.mockReturnValue(unsubscribe);
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.sendMessage('user-1', conversationId, { content: '你好' } as never, response as never);
    closeHandler?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting for task completion after SSE closes', async () => {
    const response = createResponseStub();
    let closeHandler: (() => void) | undefined;
    let resolveWaitForTask: (() => void) | undefined;
    let settled = false;
    const unsubscribe = jest.fn();
    response.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
    });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' },
      userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' },
    });
    conversationTaskService.subscribe.mockReturnValue(unsubscribe);
    conversationTaskService.waitForTask.mockImplementation(() => new Promise<void>((resolve) => {
      resolveWaitForTask = resolve;
    }));

    const request = controller.sendMessage('user-1', conversationId, { content: '你好' } as never, response as never);
    request.then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(conversationTaskService.subscribe).toHaveBeenCalledTimes(1);
    closeHandler?.();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveWaitForTask?.();
    await request;

    expect(settled).toBe(true);
    expect(conversationMessageLifecycleService.stopMessageGeneration).not.toHaveBeenCalled();
  });

  it('streams retry events and forwards stop requests through owned conversation guard', async () => {
    const response = createResponseStub();
    conversationMessageLifecycleService.retryMessageGeneration.mockResolvedValue({ id: assistantMessageId, role: 'assistant', content: '重试后的回复' });
    conversationTaskService.subscribe.mockReturnValue(jest.fn());
    conversationTaskService.waitForTask.mockResolvedValue(undefined);
    conversationMessageLifecycleService.stopMessageGeneration.mockReturnValue({ message: 'Generation stopped' });

    await controller.retryMessage('user-1', conversationId, assistantMessageId, {} as never, response as never);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.stopMessage('user-1', conversationId, assistantMessageId)).toEqual({ message: 'Generation stopped' });
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('updates and deletes messages through the runtime conversation owner', async () => {
    const message = { content: '更新后的内容', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: null, partsJson: null, provider: null, role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:01:00.000Z' };
    runtimeHostConversationMessageService.updateMessage.mockReturnValue(message);
    runtimeHostConversationMessageService.deleteMessage.mockReturnValue({ success: true });

    await expect(controller.updateMessage('user-1', conversationId, assistantMessageId, { content: '更新后的内容' } as never)).resolves.toEqual(message);
    expect(conversationTaskService.stopTask).toHaveBeenCalledWith(assistantMessageId);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    await expect(controller.deleteMessage('user-1', conversationId, assistantMessageId)).resolves.toEqual({ success: true });
    expect(conversationTaskService.stopTask).toHaveBeenLastCalledWith(assistantMessageId);
    expect(runtimeHostConversationRecordService.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('returns conversation detail messages in shared Message contract shape', () => {
    const detail = {
      _count: { messages: 1 },
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      messages: [{ content: '你好', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: 'gpt-5.4', partsJson: '[{"type":"text","text":"你好"}]', provider: 'openai', role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:00:01.000Z' }],
      title: 'New Chat',
      updatedAt: '2026-04-11T00:00:01.000Z',
    };
    runtimeHostConversationRecordService.getConversation.mockReturnValue(detail);

    expect(controller.getConversation('user-1', conversationId)).toEqual(detail);
    expect(runtimeHostConversationRecordService.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
  });
});

function sse(payload: object) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createResponseStub() {
  return { destroyed: false, end: jest.fn(), flushHeaders: jest.fn(), on: jest.fn(), setHeader: jest.fn(), writableEnded: false, write: jest.fn() };
}
