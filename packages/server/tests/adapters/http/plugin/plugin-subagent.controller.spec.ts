import { SubagentController } from '../../../../src/adapters/http/subagent/subagent.controller';

describe('SubagentController', () => {
  const runtimeHostSubagentRunnerService = {
    getSubagentOrThrow: jest.fn(),
    listOverview: jest.fn(),
    listTypes: jest.fn(),
    removeSubagentSession: jest.fn(),
  };

  let controller: SubagentController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SubagentController(runtimeHostSubagentRunnerService as never);
  });

  it('returns the subagent overview', async () => {
    runtimeHostSubagentRunnerService.listOverview.mockReturnValue({
      subagents: [
        {
          sessionId: 'subagent-session-1',
          sessionMessageCount: 2,
          sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
          visibility: 'background',
          pluginId: 'subagent',
          pluginDisplayName: 'Subagent',
          runtimeKind: 'local',
          status: 'completed',
          requestPreview: '请帮我总结当前对话',
          resultPreview: '这是后台子代理总结',
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

    expect(controller.listOverview()).toEqual({
      subagents: [
        expect.objectContaining({
          sessionId: 'subagent-session-1',
          status: 'completed',
        }),
      ],
    });
  });

  it('returns one persisted subagent session projection', async () => {
    runtimeHostSubagentRunnerService.getSubagentOrThrow.mockReturnValue({
      sessionId: 'subagent-session-1',
      sessionMessageCount: 2,
      sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
      visibility: 'background',
      pluginId: 'subagent',
      pluginDisplayName: 'Subagent',
      runtimeKind: 'local',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台子代理总结',
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
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台子代理总结',
        message: {
          role: 'assistant',
          content: '这是后台子代理总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    });

    expect(controller.getSubagent('subagent-session-1')).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: '请帮我总结当前对话',
            },
          ],
        }),
        sessionId: 'subagent-session-1',
        result: expect.objectContaining({
          text: '这是后台子代理总结',
        }),
      }),
    );
  });

  it('returns available subagent types for config selectors', () => {
    runtimeHostSubagentRunnerService.listTypes.mockReturnValue([
      {
        id: 'general',
        name: '通用',
        description: '默认子代理',
      },
      {
        id: 'explore',
        name: '探索',
      },
    ]);

    expect(controller.listTypes()).toEqual([
      {
        id: 'general',
        name: '通用',
        description: '默认子代理',
      },
      {
        id: 'explore',
        name: '探索',
      },
    ]);
  });

  it('removes one persisted subagent session projection', () => {
    runtimeHostSubagentRunnerService.removeSubagentSession.mockResolvedValue(true);

    return expect(controller.removeSubagent('subagent-session-1')).resolves.toBe(true);
  });
});
