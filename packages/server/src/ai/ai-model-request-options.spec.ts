import { resolveAiModelExecutionRequestOptions } from './ai-model-request-options';
import type { ModelConfig } from './types/provider.types';

describe('resolveAiModelExecutionRequestOptions', () => {
  const modelConfig = {
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
    limit: {
      context: 200000,
      output: 4096,
    },
    options: {
      store: false,
      reasoning: {
        effort: 'low',
      },
    },
    headers: {
      'X-Model': 'claude-default',
    },
    variants: {
      reasoningHigh: {
        reasoning: {
          effort: 'high',
        },
      },
    },
  } satisfies ModelConfig;

  it('merges model defaults, variants and request overrides', () => {
    expect(
      resolveAiModelExecutionRequestOptions({
        modelConfig,
        requestOptions: {
          variant: 'reasoningHigh',
          providerOptions: {
            reasoning: {
              budget: 2048,
            },
          },
          headers: {
            'X-Request': 'req-1',
          },
          maxOutputTokens: 128,
        },
      }),
    ).toEqual({
      providerOptions: {
        store: false,
        reasoning: {
          effort: 'high',
          budget: 2048,
        },
      },
      headers: {
        'X-Model': 'claude-default',
        'X-Request': 'req-1',
      },
      maxOutputTokens: 128,
    });
  });

  it('falls back to the model output limit', () => {
    expect(
      resolveAiModelExecutionRequestOptions({
        modelConfig,
        requestOptions: {},
      }),
    ).toEqual({
      providerOptions: {
        store: false,
        reasoning: {
          effort: 'low',
        },
      },
      headers: {
        'X-Model': 'claude-default',
      },
      maxOutputTokens: 4096,
    });
  });
});
