import { createHash } from 'node:crypto';
import type { ChatMessagePart, PluginConversationHistoryMessage } from '@garlic-claw/shared';

type SignatureModelMessage = {
  content: string | ChatMessagePart[];
  role: 'assistant' | 'system' | 'user';
};

type NormalizedPart =
  | { text: string; type: 'text' }
  | { image: string; mimeType?: string; type: 'image' };

export function createConversationHistorySignatureFromHistoryMessages(
  messages: PluginConversationHistoryMessage[],
): string {
  return createConversationHistorySignature(messages.map((message) => ({
    content: normalizeMessageContent(
      Array.isArray(message.parts) && message.parts.length > 0
        ? message.parts
        : message.content ?? '',
    ),
    role: normalizeRole(message.role),
  })));
}

export function createConversationHistorySignatureFromModelMessages(
  messages: SignatureModelMessage[],
): string {
  return createConversationHistorySignature(messages.map((message) => ({
    content: normalizeMessageContent(message.content),
    role: message.role,
  })));
}

function createConversationHistorySignature(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeMessageContent(
  content: string | ChatMessagePart[],
): string | NormalizedPart[] {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const normalized: NormalizedPart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      normalized.push({ text: part.text, type: 'text' });
      continue;
    }
    if (part.type === 'image') {
      normalized.push({
        image: part.image,
        ...(part.mimeType ? { mimeType: part.mimeType } : {}),
        type: 'image',
      });
    }
  }
  return normalized;
}

function normalizeRole(
  role: PluginConversationHistoryMessage['role'],
): SignatureModelMessage['role'] {
  if (role === 'system') {
    return 'system';
  }
  if (role === 'assistant' || role === 'display') {
    return 'assistant';
  }
  return 'user';
}
