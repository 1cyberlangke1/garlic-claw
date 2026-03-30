import { createSubagentDelegatePlugin } from './subagent-delegate.plugin';

describe('createSubagentDelegatePlugin', () => {
  it('queues a background subagent task and writes back to the current conversation by default', async () => {
    const definition = createSubagentDelegatePlugin();
    const startSubagentTask = jest.fn().mockResolvedValue({
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      status: 'queued',
      requestPreview: '请帮我总结当前对话',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'pending',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    });

    await expect(
      definition.tools!.delegate_summary_background(
        {
          prompt: '请帮我总结当前对话',
        },
        {
          callContext: {
            source: 'chat-tool',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          host: {
            getConfig: jest.fn().mockResolvedValue({
              targetProviderId: 'openai',
              targetModelId: 'gpt-5.2',
              allowedToolNames: 'recall_memory',
              maxSteps: 4,
            }),
            startSubagentTask,
          },
        } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        status: 'queued',
        writeBackStatus: 'pending',
      }),
    );

    expect(startSubagentTask).toHaveBeenCalledWith({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请帮我总结当前对话',
            },
          ],
        },
      ],
      toolNames: ['recall_memory'],
      maxSteps: 4,
      writeBack: {
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
    });
  });
});
