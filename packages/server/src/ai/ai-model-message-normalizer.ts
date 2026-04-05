import type { AiSdkMessage } from './sdk-adapter';
import type { ModelConfig } from './types/provider.types';

export function normalizeAiModelExecutionMessages(input: {
  modelConfig: ModelConfig;
  sdkMessages: AiSdkMessage[];
}): AiSdkMessage[] {
  if (shouldNormalizeAnthropicMessages(input.modelConfig)) {
    return normalizeAnthropicMessages(input.sdkMessages);
  }

  return input.sdkMessages;
}

function shouldNormalizeAnthropicMessages(modelConfig: ModelConfig): boolean {
  return (
    modelConfig.api.npm === '@ai-sdk/anthropic' ||
    modelConfig.api.npm === '@ai-sdk/google-vertex/anthropic' ||
    modelConfig.api.id.toLowerCase().includes('claude')
  );
}

function normalizeAnthropicMessages(messages: AiSdkMessage[]): AiSdkMessage[] {
  const normalized: AiSdkMessage[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      if (message.content !== '') {
        normalized.push(message);
      }
      continue;
    }

    const filteredContent = message.content.filter((part) => {
      if (part.type !== 'text') {
        return true;
      }

      return part.text !== '';
    });

    if (filteredContent.length > 0) {
      normalized.push({
        ...message,
        content: filteredContent,
      });
    }
  }

  return normalized;
}
