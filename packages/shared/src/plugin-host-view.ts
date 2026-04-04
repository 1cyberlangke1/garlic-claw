import { deserializeMessageParts } from './chat-message-parts';

export function toConversationSummary(input: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    title: input.title,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function toMemorySummary(input: {
  id: string;
  content: string;
  category: string;
  createdAt: Date;
}) {
  return {
    id: input.id,
    content: input.content,
    category: input.category,
    createdAt: input.createdAt.toISOString(),
  };
}

export function toUserSummary(input: {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    username: input.username,
    email: input.email,
    role: input.role,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function toConversationMessageSummary(input: {
  id: string;
  role: string;
  content: string | null;
  partsJson: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    parts: deserializeMessageParts(input.partsJson),
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function buildConversationMessageSummaries(
  messages: Array<{
    id: string;
    role: string;
    content: string | null;
    partsJson: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  return messages.map((message) => toConversationMessageSummary(message));
}
