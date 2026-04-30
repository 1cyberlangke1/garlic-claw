import { RuntimeHostConversationMessageService } from '../../src/runtime/host/runtime-host-conversation-message.service';
import {
  RuntimeHostConversationRecordService,
  serializeConversationMessage,
} from '../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostConversationTodoService } from '../../src/runtime/host/runtime-host-conversation-todo.service';
import { ConversationTaskService, type ConversationTaskEvent } from '../../src/conversation/conversation-task.service';
import { RuntimeToolPermissionService } from '../../src/execution/runtime/runtime-tool-permission.service';

describe('ConversationTaskService', () => {
  let conversationId: string;
  let runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  let runtimeHostConversationMessageService: RuntimeHostConversationMessageService;
  let runtimeHostConversationTodoService: RuntimeHostConversationTodoService;
  let runtimeToolPermissionService: RuntimeToolPermissionService;
  let service: ConversationTaskService;

  beforeEach(() => {
    runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
    runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(runtimeHostConversationRecordService);
    runtimeHostConversationTodoService = new RuntimeHostConversationTodoService(runtimeHostConversationRecordService);
    runtimeToolPermissionService = new RuntimeToolPermissionService();
    service = new ConversationTaskService(runtimeHostConversationMessageService, runtimeToolPermissionService, runtimeHostConversationTodoService);
    conversationId = (runtimeHostConversationRecordService.createConversation({ title: 'Conversation conversation-1' }) as { id: string }).id;
  });

  it('streams task events, persists completion patches, and stores tool activity on the assistant message', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];
    const onSent = jest.fn();

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield rawCustomFieldChunk('reasoning_content', '先检查');
            yield rawCustomFieldChunk('reasoning_content', '上下文');
            yield delta('模型');
            yield toolCall();
            yield toolResult();
          })(),
          usage: Promise.resolve({
            inputTokens: 21,
            outputTokens: 9,
            source: 'provider',
            totalTokens: 30,
          }),
        },
      }),
      modelId: 'gpt-5.4',
      onComplete: async (result) => ({ ...result, content: '最终回复', parts: [{ text: '最终回复', type: 'text' }] }),
      onSent,
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));
    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual([
      { messageId: String(assistantMessage.id), status: 'streaming', type: 'status' },
      {
        messageId: String(assistantMessage.id),
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              source: {
                key: 'reasoning_content',
                origin: 'ai-sdk.raw',
                providerId: 'openai',
              },
              state: 'streaming',
              text: '先检查',
              title: 'Reasoning Content',
            },
          ],
        },
        type: 'message-metadata',
      },
      {
        messageId: String(assistantMessage.id),
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              source: {
                key: 'reasoning_content',
                origin: 'ai-sdk.raw',
                providerId: 'openai',
              },
              state: 'streaming',
              text: '先检查上下文',
              title: 'Reasoning Content',
            },
          ],
        },
        type: 'message-metadata',
      },
      { messageId: String(assistantMessage.id), text: '模型', type: 'text-delta' },
      { input: { city: 'Shanghai' }, messageId: String(assistantMessage.id), toolCallId: 'tool-call-1', toolName: 'weather.search', type: 'tool-call' },
      { messageId: String(assistantMessage.id), output: { temp: 20 }, toolCallId: 'tool-call-1', toolName: 'weather.search', type: 'tool-result' },
      { content: '最终回复', messageId: String(assistantMessage.id), parts: [{ text: '最终回复', type: 'text' }], type: 'message-patch' },
      { messageId: String(assistantMessage.id), status: 'completed', type: 'finish' },
    ]);

    const conversation = runtimeHostConversationRecordService.requireConversation(conversationId);
    const persistedMetadata = JSON.parse(String(conversation.messages[0].metadataJson));
    expect(conversation.messages[0]).toMatchObject({
      content: '最终回复',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
      toolCalls: [toolCallRecord()],
      toolResults: [toolResultRecord()],
    });
    expect(persistedMetadata).toEqual({
      annotations: [
        {
          data: {
            inputTokens: 21,
            modelId: 'gpt-5.4',
            outputTokens: 9,
            providerId: 'openai',
            source: 'provider',
            totalTokens: 30,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        },
      ],
      customBlocks: [
        {
          id: 'custom-field:reasoning_content',
          kind: 'text',
          source: {
            key: 'reasoning_content',
            origin: 'ai-sdk.raw',
            providerId: 'openai',
          },
          state: 'done',
          text: '先检查上下文',
          title: 'Reasoning Content',
        },
      ],
    });
    expect(serializeConversationMessage(conversation.messages[0] as never)).toMatchObject({
      content: '最终回复',
      metadataJson: JSON.stringify(persistedMetadata),
      toolCalls: JSON.stringify([toolCallRecord()]),
      toolResults: JSON.stringify([toolResultRecord()]),
    });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ content: '最终回复' }));
  });

  it('stops an active task and leaves the assistant message in stopped state', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async (abortSignal) => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('片段');
            await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.stopTask(String(assistantMessage.id));

    expect(runtimeHostConversationRecordService.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '片段',
      role: 'assistant',
      status: 'stopped',
    });
    expect(events).toEqual(expect.arrayContaining([
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'status' },
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'finish' },
    ]));
  });

  it('normalizes tool-error parts into persisted tool results', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield {
              error: 'request timeout',
              input: {
                city: 'Shanghai',
              },
              toolCallId: 'tool-call-2',
              toolName: 'weather.search',
              type: 'tool-error' as const,
            };
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    await service.waitForTask(String(assistantMessage.id));

    expect(runtimeHostConversationRecordService.requireConversation(conversationId).messages[0]).toMatchObject({
      role: 'assistant',
      status: 'completed',
      toolResults: [
        {
          output: {
            error: 'request timeout',
            inputText: JSON.stringify({
              city: 'Shanghai',
            }, null, 2),
            phase: 'execute',
            recovered: true,
            tool: 'weather.search',
            type: 'invalid-tool-result',
          },
          toolCallId: 'tool-call-2',
          toolName: 'weather.search',
        },
      ],
    });
  });

  it('forwards runtime permission request and resolution events into the task stream', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            await runtimeToolPermissionService.review({
              backend: {
                capabilities: {
                  networkAccess: true,
                  persistentFilesystem: true,
                  persistentShellState: false,
                  shellExecution: true,
                  workspaceRead: true,
                  workspaceWrite: true,
                },
                kind: 'just-bash',
                permissionPolicy: {
                  networkAccess: 'allow',
                  persistentFilesystem: 'allow',
                  persistentShellState: 'deny',
                  shellExecution: 'ask',
                  workspaceRead: 'allow',
                  workspaceWrite: 'allow',
                },
              },
              conversationId,
              messageId: String(assistantMessage.id),
              requiredOperations: ['command.execute'],
              summary: '执行测试 bash 命令',
              toolName: 'bash',
            });
            yield delta('权限已通过');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));
    const [pendingRequest] = runtimeToolPermissionService.listPendingRequests(conversationId);
    expect(pendingRequest).toMatchObject({
      operations: ['command.execute'],
      messageId: String(assistantMessage.id),
      toolName: 'bash',
    });

    const replyResult = runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
    expect(replyResult).toEqual({
      requestId: pendingRequest.id,
      resolution: 'approved',
    });
    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual(expect.arrayContaining([
      {
        messageId: String(assistantMessage.id),
        request: expect.objectContaining({
          id: pendingRequest.id,
          summary: '执行测试 bash 命令',
        }),
        type: 'permission-request',
      },
      {
        messageId: String(assistantMessage.id),
        result: {
          requestId: pendingRequest.id,
          resolution: 'approved',
        },
        type: 'permission-resolved',
      },
    ]));
  });

  it('forwards todo owner updates into the task stream without parsing tool text output', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            runtimeHostConversationTodoService.replaceSessionTodo(conversationId, [
              { content: '同步 todo 面板', priority: 'high', status: 'in_progress' },
            ]);
            yield delta('todo 已更新');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual(expect.arrayContaining([
      {
        conversationId,
        todos: [
          { content: '同步 todo 面板', priority: 'high', status: 'in_progress' },
        ],
        type: 'todo-updated',
      },
    ]));
  });

  it('keeps running and persists the assistant message after the listener unsubscribes', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const continueStreamRef: { current: null | (() => void) } = { current: null };

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('前端断开后');
            await new Promise<void>((resolve) => {
              continueStreamRef.current = resolve;
            });
            yield delta('继续完成');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    const unsubscribe = service.subscribe(String(assistantMessage.id), () => undefined);

    await new Promise((resolve) => setTimeout(resolve, 0));
    unsubscribe();
    if (continueStreamRef.current) {
      continueStreamRef.current();
    }
    await service.waitForTask(String(assistantMessage.id));

    expect(runtimeHostConversationRecordService.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '前端断开后继续完成',
      role: 'assistant',
      status: 'completed',
    });
  });

  it('marks the assistant message as error when stream consumption fails and does not leak rejected stream promises', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const unhandledErrors: unknown[] = [];
    const handleUnhandledRejection = (reason: unknown) => {
      unhandledErrors.push(reason);
    };
    process.on('unhandledRejection', handleUnhandledRejection);

    try {
      service.startTask({
        assistantMessageId: String(assistantMessage.id),
        conversationId,
        createStream: async () => {
          const streamFailure = new Error('invalid x-api-key');
          return {
            modelId: 'claude-3-5-sonnet-20241022',
            providerId: 'anthropic',
            stream: {
              finishReason: Promise.reject(streamFailure),
              fullStream: (async function* () {
                yield delta('部分输出');
                throw streamFailure;
              })(),
              usage: Promise.reject(streamFailure),
            },
          };
        },
        modelId: 'claude-3-5-sonnet-20241022',
        providerId: 'anthropic',
      });

      await service.waitForTask(String(assistantMessage.id));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(runtimeHostConversationRecordService.requireConversation(conversationId).messages[0]).toMatchObject({
        content: '部分输出',
        error: 'invalid x-api-key',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        role: 'assistant',
        status: 'error',
      });
      expect(unhandledErrors).toEqual([]);
    } finally {
      process.off('unhandledRejection', handleUnhandledRejection);
    }
  });
});

function createAssistantMessage(runtimeHostConversationMessageService: RuntimeHostConversationMessageService) {
  const conversationId = (((runtimeHostConversationMessageService as unknown as {
    runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  }).runtimeHostConversationRecordService.listConversations() as Array<{ id: string }>)[0]).id;
  return runtimeHostConversationMessageService.createMessage(conversationId, {
    content: '',
    model: 'gpt-5.4',
    parts: [],
    provider: 'openai',
    role: 'assistant',
    status: 'pending',
  });
}

function delta(text: string) {
  return { text, type: 'text-delta' as const };
}

function rawCustomFieldChunk(key: string, value: string) {
  return {
    rawValue: {
      choices: [
        {
          delta: {
            [key]: value,
          },
          index: 0,
        },
      ],
      id: 'raw-chunk-1',
      model: 'deepseek-reasoner',
      object: 'chat.completion.chunk',
    },
    type: 'raw' as const,
  };
}

function toolCallRecord() {
  return { input: { city: 'Shanghai' }, toolCallId: 'tool-call-1', toolName: 'weather.search' };
}

function toolResultRecord() {
  return { output: { temp: 20 }, toolCallId: 'tool-call-1', toolName: 'weather.search' };
}

function toolCall() {
  return { ...toolCallRecord(), type: 'tool-call' as const };
}

function toolResult() {
  return { ...toolResultRecord(), type: 'tool-result' as const };
}
