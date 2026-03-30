import { PluginSubagentTaskController } from './plugin-subagent-task.controller';

describe('PluginSubagentTaskController', () => {
  const subagentTasks = {
    listOverview: jest.fn(),
    getTaskOrThrow: jest.fn(),
  };

  let controller: PluginSubagentTaskController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginSubagentTaskController(subagentTasks as never);
  });

  it('returns the background subagent task overview', async () => {
    subagentTasks.listOverview.mockResolvedValue({
      tasks: [
        {
          id: 'subagent-task-1',
          pluginId: 'builtin.subagent-delegate',
          pluginDisplayName: '子代理委派',
          runtimeKind: 'builtin',
          status: 'completed',
          requestPreview: '请帮我总结当前对话',
          resultPreview: '这是后台任务总结',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          writeBackStatus: 'sent',
          writeBackMessageId: 'assistant-message-1',
          requestedAt: '2026-03-30T12:00:00.000Z',
          startedAt: '2026-03-30T12:00:01.000Z',
          finishedAt: '2026-03-30T12:00:05.000Z',
        },
      ],
    });

    await expect(controller.listOverview()).resolves.toEqual({
      tasks: [
        expect.objectContaining({
          id: 'subagent-task-1',
          status: 'completed',
        }),
      ],
    });
  });

  it('returns one persisted background subagent task by id', async () => {
    subagentTasks.getTaskOrThrow.mockResolvedValue({
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台任务总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'sent',
      writeBackMessageId: 'assistant-message-1',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台任务总结',
        message: {
          role: 'assistant',
          content: '这是后台任务总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    });

    await expect(controller.getTask('subagent-task-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        result: expect.objectContaining({
          text: '这是后台任务总结',
        }),
      }),
    );
  });
});
