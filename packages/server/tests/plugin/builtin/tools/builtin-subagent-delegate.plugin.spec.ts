import { BUILTIN_SUBAGENT_DELEGATE_PLUGIN } from '../../../../src/plugin/builtin/tools/builtin-subagent-delegate.plugin';

describe('BUILTIN_SUBAGENT_DELEGATE_PLUGIN', () => {
  it('delegates summary runs through the host subagent API', async () => {
    const runSubagent = jest.fn().mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'summary',
      toolCalls: [],
      toolResults: [],
    });

    const result = await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary?.({
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          llm: {
            targetModelId: 'gpt-5.4',
            targetProviderId: 'openai',
          },
          tools: {
            allowedToolNames: ['memory.search', 'web.search'],
          },
        }),
        runSubagent,
      },
    } as never);

    expect(runSubagent).toHaveBeenCalledWith({
      messages: [
        {
          content: [{ text: 'Summarize this thread', type: 'text' }],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      toolNames: ['memory.search', 'web.search'],
    });
    expect(result).toEqual({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'summary',
      toolCalls: [],
      toolResults: [],
    });
  });

  it('starts background tasks and defaults write-back to the current conversation', async () => {
    const startSubagentTask = jest.fn().mockResolvedValue({
      id: 'task-1',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Summarize this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });

    const result = await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary_background?.({
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          llm: {
            targetModelId: 'gpt-5.4',
            targetProviderId: 'openai',
          },
        }),
        startSubagentTask,
      },
    } as never);

    expect(startSubagentTask).toHaveBeenCalledWith({
      messages: [
        {
          content: [{ text: 'Summarize this thread', type: 'text' }],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: 'conversation-1',
          type: 'conversation',
        },
      },
    });
    expect(result).toEqual({
      id: 'task-1',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Summarize this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });
  });

  it('passes sessionId through to foreground and background delegation calls', async () => {
    const runSubagent = jest.fn().mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'continued',
      toolCalls: [],
      toolResults: [],
    });
    const startSubagentTask = jest.fn().mockResolvedValue({
      id: 'task-9',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Continue this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });
    const host = {
      getConfig: jest.fn().mockResolvedValue({
        llm: {
          targetModelId: 'gpt-5.4',
          targetProviderId: 'openai',
        },
      }),
      runSubagent,
      startSubagentTask,
    };

    await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary?.({
      description: '继续当前子任务',
      prompt: 'Continue this thread',
      sessionId: 'subagent-session-9',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host,
    } as never);
    await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary_background?.({
      description: '继续当前子任务',
      prompt: 'Continue this thread',
      sessionId: 'subagent-session-9',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host,
    } as never);

    expect(runSubagent).toHaveBeenCalledWith(expect.objectContaining({
      description: '继续当前子任务',
      sessionId: 'subagent-session-9',
    }));
    expect(startSubagentTask).toHaveBeenCalledWith(expect.objectContaining({
      description: '继续当前子任务',
      sessionId: 'subagent-session-9',
    }));
  });

  it('uses configured targetSubagentType when plugin config declares a subagent type', async () => {
    const runSubagent = jest.fn().mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'summary',
      toolCalls: [],
      toolResults: [],
    });

    await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary?.({
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          llm: {
            targetSubagentType: 'explore',
          },
        }),
        runSubagent,
      },
    } as never);

    expect(runSubagent).toHaveBeenCalledWith(expect.objectContaining({
      subagentType: 'explore',
    }));
  });

  it('lets per-call subagentType override the configured subagent type', async () => {
    const startSubagentTask = jest.fn().mockResolvedValue({
      id: 'task-1',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Summarize this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });

    await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary_background?.({
      subagentType: 'general',
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          llm: {
            targetSubagentType: 'explore',
          },
        }),
        startSubagentTask,
      },
    } as never);

    expect(startSubagentTask).toHaveBeenCalledWith(expect.objectContaining({
      subagentType: 'general',
    }));
  });
});
