import {
  normalizeUserMessageInput,
  restoreModelMessageContent,
  toModelMessageContent,
  type ChatImagePart,
  type ChatTextPart,
  type PersistedChatMessage,
  type UserMessageInput,
} from '@garlic-claw/shared';
import { normalizeMessageRole } from './chat-message.helpers';

export type ChatRuntimeMessageContent = string | Array<ChatTextPart | ChatImagePart>;

export interface ChatRuntimeMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ChatRuntimeMessageContent;
}

export interface PersistedConversationMessage extends PersistedChatMessage {
  role: string;
}

export interface PreparedSendMessagePayload {
  persistedMessage: {
    content: string;
    parts: Array<ChatTextPart | ChatImagePart>;
  };
  modelMessages: ChatRuntimeMessage[];
}

export function prepareSendMessagePayload(params: {
  history: PersistedConversationMessage[];
  input: UserMessageInput;
}): PreparedSendMessagePayload {
  const normalizedInput = normalizeUserMessageInput(params.input);

  return {
    persistedMessage: {
      content: normalizedInput.content,
      parts: normalizedInput.parts,
    },
    modelMessages: [
      ...params.history.map((message) => ({
        role: normalizeMessageRole(message.role),
        content: restoreModelMessageContent(message),
      })),
      {
        role: 'user',
        content: toModelMessageContent(
          normalizedInput.parts,
          normalizedInput.content,
        ),
      },
    ],
  };
}
