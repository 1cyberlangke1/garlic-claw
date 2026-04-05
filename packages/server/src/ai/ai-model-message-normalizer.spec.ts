import { normalizeAiModelExecutionMessages } from './ai-model-message-normalizer';
import type { ModelConfig } from './types/provider.types';

describe('normalizeAiModelExecutionMessages', () => {
  const anthropicModel = {
    id: 'claude-3-7-sonnet',
    providerId: 'anthropic',
    name: 'Claude 3.7 Sonnet',
    capabilities: {
      input: { text: true, image: true },
      output: { text: true, image: false },
      reasoning: true,
      toolCall: true,
    },
    api: {
      id: 'claude-3-7-sonnet',
      url: 'https://api.anthropic.com/v1',
      npm: '@ai-sdk/anthropic',
    },
  } satisfies ModelConfig;

  const openAiModel = {
    ...anthropicModel,
    id: 'gpt-5.2',
    providerId: 'openai',
    api: {
      id: 'gpt-5.2',
      url: 'https://api.openai.com/v1',
      npm: '@ai-sdk/openai',
    },
  } satisfies ModelConfig;

  it('drops empty anthropic messages and empty text parts', () => {
    const image = new ArrayBuffer(3);

    expect(
      normalizeAiModelExecutionMessages({
        modelConfig: anthropicModel,
        sdkMessages: [
          {
            role: 'assistant',
            content: '',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '',
              },
              {
                type: 'image',
                image,
              },
              {
                type: 'text',
                text: '保留这段文本',
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image,
          },
          {
            type: 'text',
            text: '保留这段文本',
          },
        ],
      },
    ]);
  });

  it('leaves non-anthropic messages unchanged', () => {
    const messages = [
      {
        role: 'assistant' as const,
        content: '',
      },
      {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: '',
          },
        ],
      },
    ];

    expect(
      normalizeAiModelExecutionMessages({
        modelConfig: openAiModel,
        sdkMessages: messages,
      }),
    ).toBe(messages);
  });
});
