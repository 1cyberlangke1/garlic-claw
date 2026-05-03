import type { ChatMessagePart, JsonValue, PluginConversationHistoryMessage } from '@garlic-claw/shared';

export type ConversationVisibleModelMessage = {
  content: string | ChatMessagePart[];
  role: 'assistant' | 'system' | 'user';
};

export function buildConversationVisibleModelMessages(
  messages: PluginConversationHistoryMessage[],
): ConversationVisibleModelMessage[] {
  return messages.flatMap((message) => buildConversationVisibleModelMessagesFromMessage(message));
}

export function buildConversationVisibleModelMessagesFromMessage(
  message: PluginConversationHistoryMessage,
): ConversationVisibleModelMessage[] {
  if (message.role === 'display' && !isCompactionSummaryDisplayMessage(message)) {
    return [];
  }
  const role = normalizeVisibleRole(message.role);
  const visibleMessages: ConversationVisibleModelMessage[] = [];
  const baseContent = readBaseContent(message);
  if (baseContent) {
    visibleMessages.push({ content: baseContent, role });
  }
  const toolTranscript = readToolTranscript(message);
  if (toolTranscript) {
    visibleMessages.push({ content: toolTranscript, role });
  }
  return visibleMessages;
}

export function readConversationVisiblePreviewText(
  messages: ConversationVisibleModelMessage[],
): string {
  return messages
    .map((message) => {
      const content = readConversationVisibleModelMessageText(message);
      return content
        ? [message.role, content].join('\n')
        : '';
    })
    .filter(Boolean)
    .join('\n');
}

export function readConversationVisibleModelMessageText(
  message: ConversationVisibleModelMessage,
): string {
  if (typeof message.content === 'string') {
    return message.content.trim();
  }
  return message.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
    .trim();
}

function readBaseContent(
  message: PluginConversationHistoryMessage,
): string | ChatMessagePart[] | null {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts;
  }
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content;
  }
  return null;
}

function readToolTranscript(message: PluginConversationHistoryMessage): string {
  const lines = [
    ...(message.toolCalls ?? []).flatMap((entry) => {
      const record = isRecord(entry) ? entry : null;
      return record ? renderToolEvent('工具调用', record.toolName, record.input) : [];
    }),
    ...(message.toolResults ?? []).flatMap((entry) => {
      const record = isRecord(entry) ? entry : null;
      return record ? renderToolEvent('工具结果', record.toolName, record.output) : [];
    }),
  ];
  return lines.join('\n').trim();
}

function renderToolEvent(
  label: string,
  toolName: unknown,
  payload: unknown,
): string[] {
  const renderedPayload = renderToolPayload(payload);
  if (!renderedPayload) {
    return [];
  }
  const normalizedToolName = typeof toolName === 'string' && toolName.trim()
    ? toolName.trim()
    : 'unknown-tool';
  return [`[${label}:${normalizedToolName}] ${renderedPayload}`];
}

function renderToolPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return compactText(payload, 600);
  }
  if (!isRecord(payload)) {
    return renderCompactJson(payload);
  }
  if (payload.kind === 'tool:text' && typeof payload.value === 'string') {
    return compactText(payload.value, 600);
  }
  if (payload.kind === 'tool:json') {
    return renderCompactJson(payload.value ?? null);
  }
  if (typeof payload.result === 'string' && payload.result.trim()) {
    return compactText(payload.result, 600);
  }
  if (isRecord(payload.result) && typeof payload.result.text === 'string' && payload.result.text.trim()) {
    return compactText(payload.result.text, 600);
  }
  return renderCompactJson(payload);
}

function renderCompactJson(value: unknown): string {
  const normalized = compactJsonValue(value, 0);
  try {
    return JSON.stringify(normalized);
  } catch {
    return String(normalized);
  }
}

function compactJsonValue(value: unknown, depth: number): JsonValue {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'string') {
    return compactText(value, 200);
  }
  if (Array.isArray(value)) {
    const next = value.slice(0, 8).map((entry) => compactJsonValue(entry, depth + 1));
    if (value.length > 8) {
      next.push(`... ${value.length - 8} more item(s)`);
    }
    return next;
  }
  if (!isRecord(value)) {
    return String(value);
  }
  if (depth >= 3) {
    return '[max depth reached]';
  }
  const result: Record<string, JsonValue> = {};
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  for (const [key, entry] of entries.slice(0, 12)) {
    result[key] = compactJsonValue(entry, depth + 1);
  }
  if (entries.length > 12) {
    result.__truncatedKeys = `... ${entries.length - 12} more key(s)`;
  }
  return result;
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}... [truncated ${normalized.length - maxLength} chars]`;
}

function normalizeVisibleRole(
  role: PluginConversationHistoryMessage['role'],
): ConversationVisibleModelMessage['role'] {
  if (role === 'system') {
    return 'system';
  }
  if (role === 'assistant' || role === 'display') {
    return 'assistant';
  }
  return 'user';
}

function isCompactionSummaryDisplayMessage(
  message: PluginConversationHistoryMessage,
): boolean {
  return (message.metadata?.annotations ?? []).some((annotation) => {
    const data = isRecord(annotation.data) ? annotation.data : null;
    return annotation.owner === 'conversation.context-governance'
      && annotation.type === 'context-compaction'
      && data?.role === 'summary';
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
