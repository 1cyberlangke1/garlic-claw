import type {
  ChatImagePart,
  ChatMessagePart,
  ChatTextPart,
} from './types/chat';

export type {
  ChatImagePart,
  ChatMessagePart,
  ChatTextPart,
} from './types/chat';

export interface UserMessageInput {
  content?: string | null;
  parts?: ChatMessagePart[] | null;
}

export interface NormalizedUserMessageInput {
  content: string;
  parts: ChatMessagePart[];
  hasImages: boolean;
}

export interface PersistedChatMessage {
  content?: string | null;
  partsJson?: string | null;
}

export interface AssistantMessageOutputInput {
  content?: string | null;
  parts?: ChatMessagePart[] | null;
}

export interface NormalizedAssistantMessageOutput {
  content: string;
  parts: ChatMessagePart[];
}

export function normalizeUserMessageInput(
  input: UserMessageInput,
): NormalizedUserMessageInput {
  const normalizedParts = normalizeParts(input);
  if (normalizedParts.length === 0) {
    throw new Error('Message content is empty');
  }

  const content = deriveTextContentFromParts(normalizedParts);

  return {
    content,
    parts: normalizedParts,
    hasImages: normalizedParts.some((part) => part.type === 'image'),
  };
}

export function serializeMessageParts(parts: readonly ChatMessagePart[]): string {
  return JSON.stringify(parts);
}

export function deserializeMessageParts(
  value?: string | null,
): ChatMessagePart[] {
  if (!value) {
    return [];
  }

  return JSON.parse(value) as ChatMessagePart[];
}

export function deriveTextContentFromParts(
  parts: readonly ChatMessagePart[],
): string {
  return parts
    .filter((part): part is ChatTextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function normalizeAssistantMessageOutput(
  input: AssistantMessageOutputInput,
): NormalizedAssistantMessageOutput {
  const normalizedParts = input.parts
    ? input.parts.flatMap((part) => normalizePart(part))
    : [];

  if (normalizedParts.length > 0) {
    return {
      content: deriveTextContentFromParts(normalizedParts),
      parts: normalizedParts,
    };
  }

  const text = input.content?.trim() ?? '';
  if (!text) {
    return {
      content: '',
      parts: [],
    };
  }

  return {
    content: text,
    parts: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

export function toModelMessageContent(
  parts: readonly ChatMessagePart[],
  fallbackContent = '',
): string | Array<ChatTextPart | ChatImagePart> {
  if (parts.length === 0) {
    return fallbackContent;
  }

  const hasImages = parts.some((part) => part.type === 'image');
  if (!hasImages) {
    return deriveTextContentFromParts(parts);
  }

  return parts.map((part) =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image',
          image: part.image,
          mimeType: part.mimeType,
        },
  );
}

export function restoreModelMessageContent(
  message: PersistedChatMessage,
): string | Array<ChatTextPart | ChatImagePart> {
  const parts = deserializeMessageParts(message.partsJson);
  if (parts.length === 0) {
    return message.content || '';
  }

  return toModelMessageContent(parts, message.content || '');
}

function normalizeParts(input: UserMessageInput): ChatMessagePart[] {
  if (input.parts && input.parts.length > 0) {
    return input.parts.flatMap((part) => normalizePart(part));
  }

  const text = input.content?.trim();
  if (!text) {
    return [];
  }

  return [{ type: 'text', text }];
}

function normalizePart(part: ChatMessagePart): ChatMessagePart[] {
  if (part.type === 'text') {
    const text = part.text.trim();
    return text ? [{ type: 'text', text }] : [];
  }

  return [part];
}
