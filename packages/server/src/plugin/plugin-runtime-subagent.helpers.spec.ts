import {
  assertSubagentRequestInputSupported,
  buildResolvedSubagentAfterRunPayload,
  collectSubagentRunResult,
  buildResolvedSubagentRunResult,
  buildResolvedSubagentRequest,
  buildSubagentRunResult,
  buildSubagentStreamPreparedInput,
  buildSubagentToolSetRequest,
} from './plugin-runtime-subagent.helpers';

describe('plugin-runtime-subagent.helpers', () => {
  it('builds cloned subagent results', () => {
    const result = buildSubagentRunResult({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: 'done',
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          input: {
            query: 'hello',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          output: {
            ok: true,
          },
        },
      ],
    });

    expect(result).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: 'done',
      message: {
        role: 'assistant',
        content: 'done',
      },
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          input: {
            query: 'hello',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          output: {
            ok: true,
          },
        },
      ],
    });
  });

  it('builds resolved subagent requests without mutating the original request', () => {
    const original = {
      messages: [{ role: 'user' as const, content: 'hello' }],
      maxSteps: 3,
    };

    const resolved = buildResolvedSubagentRequest({
      request: original,
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(resolved).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 3,
    });
    expect(original).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 3,
    });
  });

  it('builds resolved subagent results from model config', () => {
    expect(
      buildResolvedSubagentRunResult({
        modelConfig: {
          providerId: 'anthropic',
          id: 'claude-3-7-sonnet',
        },
        text: 'blocked',
        finishReason: null,
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'search',
            input: {
              query: 'hello',
            },
          },
        ],
      }),
    ).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: 'blocked',
      message: {
        role: 'assistant',
        content: 'blocked',
      },
      finishReason: null,
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          input: {
            query: 'hello',
          },
        },
      ],
      toolResults: [],
    });
  });

  it('collects subagent stream output into a resolved result', async () => {
    async function* createFullStream() {
      yield {
        type: 'tool-call' as const,
        toolCallId: 'call-1',
        toolName: 'search',
        input: {
          query: 'hello',
        },
      };
      yield {
        type: 'tool-result' as const,
        toolCallId: 'call-1',
        toolName: 'search',
        output: {
          ok: true,
        },
      };
      yield {
        type: 'text-delta' as const,
        text: 'done',
      };
      yield {
        type: 'step-start' as const,
      };
    }

    await expect(
      collectSubagentRunResult({
        modelConfig: {
          providerId: 'openai',
          id: 'gpt-5.2',
        },
        fullStream: createFullStream(),
        finishReason: Promise.resolve('stop'),
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: 'done',
      message: {
        role: 'assistant',
        content: 'done',
      },
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          input: {
            query: 'hello',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'search',
          output: {
            ok: true,
          },
        },
      ],
    });
  });

  it('builds subagent tool set requests only when context is complete', () => {
    expect(
      buildSubagentToolSetRequest({
        pluginId: 'plugin-a',
        context: {
          source: 'plugin',
          conversationId: 'conversation-1',
        },
        providerId: 'openai',
        modelId: 'gpt-5.2',
      }),
    ).toBeUndefined();

    expect(
      buildSubagentToolSetRequest({
        pluginId: 'plugin-a',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activePersonaId: 'persona-1',
        },
        providerId: 'openai',
        modelId: 'gpt-5.2',
        toolNames: ['search'],
      }),
    ).toEqual({
      context: {
        source: 'subagent',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'persona-1',
      },
      allowedToolNames: ['search'],
      excludedSources: [
        {
          kind: 'plugin',
          id: 'plugin-a',
        },
      ],
    });
  });

  it('rejects image input when the resolved model lacks image capability', () => {
    expect(() =>
      assertSubagentRequestInputSupported({
        request: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  image: 'https://example.com/cat.png',
                },
              ],
            },
          ],
        },
        modelConfig: {
          capabilities: {
            input: {
              text: true,
              image: false,
            },
          },
        } as never,
      }),
    ).toThrow('subagent.run 当前模型不支持图片输入');

    expect(() =>
      assertSubagentRequestInputSupported({
        request: {
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
        },
        modelConfig: {
          capabilities: {
            input: {
              text: true,
              image: false,
            },
          },
        } as never,
      }),
    ).not.toThrow();
  });

  it('builds streamPrepared input from a subagent request snapshot', () => {
    const prepared = {
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-5.2',
      },
      model: {
        provider: 'openai',
        modelId: 'gpt-5.2',
      },
      sdkMessages: [],
      sourceSdkMessages: [],
    } as never;
    const tools = {
      recall_memory: {
        description: '读取记忆',
      },
    } as never;

    expect(
      buildSubagentStreamPreparedInput({
        prepared,
        request: {
          system: '你是子代理',
          maxSteps: 3,
          variant: 'balanced',
          providerOptions: {
            openai: {
              reasoningEffort: 'medium',
            },
          },
          headers: {
            'x-test': '1',
          },
          maxOutputTokens: 256,
        },
        tools,
      }),
    ).toEqual({
      prepared,
      system: '你是子代理',
      tools,
      stopWhen: expect.anything(),
      variant: 'balanced',
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
        },
      },
      headers: {
        'x-test': '1',
      },
      maxOutputTokens: 256,
    });
  });

  it('builds resolved subagent after-run payloads', () => {
    expect(
      buildResolvedSubagentAfterRunPayload({
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activePersonaId: 'persona-1',
        },
        pluginId: 'builtin.subagent-delegate',
        request: {
          messages: [{ role: 'user', content: 'hello' }],
          maxSteps: 2,
        },
        modelConfig: {
          providerId: 'anthropic',
          id: 'claude-3-7-sonnet',
        },
        result: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          text: 'done',
          message: {
            role: 'assistant',
            content: 'done',
          },
          toolCalls: [],
          toolResults: [],
        },
      }),
    ).toEqual({
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'persona-1',
      },
      pluginId: 'builtin.subagent-delegate',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        messages: [{ role: 'user', content: 'hello' }],
        maxSteps: 2,
      },
      result: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        text: 'done',
        message: {
          role: 'assistant',
          content: 'done',
        },
        toolCalls: [],
        toolResults: [],
      },
    });
  });
});
