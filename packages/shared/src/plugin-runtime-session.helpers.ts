import type {
  MessageReceivedHookPayload,
  PluginConversationSessionInfo,
  PluginMessageHookInfo,
} from './types/plugin';
import type { JsonValue } from './types/json';
import { toJsonValue } from './types/json';
import {
  cloneMessageHookInfo,
  cloneMessageReceivedHookPayload,
} from './plugin-runtime-clone.helpers';

export interface ConversationSessionRecord {
  pluginId: string;
  conversationId: string;
  startedAt: number;
  expiresAt: number;
  lastMatchedAt: number | null;
  captureHistory: boolean;
  historyMessages: PluginMessageHookInfo[];
  metadata?: JsonValue;
}

export function createConversationSessionRecord(input: {
  pluginId: string;
  conversationId: string;
  timeoutMs: number;
  captureHistory: boolean;
  metadata?: JsonValue;
  now: number;
}): ConversationSessionRecord {
  return {
    pluginId: input.pluginId,
    conversationId: input.conversationId,
    startedAt: input.now,
    expiresAt: input.now + input.timeoutMs,
    lastMatchedAt: null,
    captureHistory: input.captureHistory,
    historyMessages: [],
    ...(typeof input.metadata !== 'undefined'
      ? { metadata: toJsonValue(input.metadata) }
      : {}),
  };
}

export function getActiveConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  conversationId: string | undefined,
  now: number,
): ConversationSessionRecord | null {
  if (!conversationId) {
    return null;
  }

  const session = sessions.get(conversationId);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= now) {
    sessions.delete(conversationId);
    return null;
  }

  return session;
}

export function getOwnedConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string,
  conversationId: string,
  now: number,
): ConversationSessionRecord | null {
  const session = getActiveConversationSession(sessions, conversationId, now);
  if (!session || session.pluginId !== pluginId) {
    return null;
  }

  return session;
}

export function getActiveConversationSessionInfo(
  sessions: Map<string, ConversationSessionRecord>,
  conversationId: string | undefined,
  now: number,
): PluginConversationSessionInfo | null {
  const session = getActiveConversationSession(sessions, conversationId, now);
  return session ? toConversationSessionInfo(session, now) : null;
}

export function extendConversationSession(
  session: ConversationSessionRecord,
  input: {
    timeoutMs: number;
    resetTimeout: boolean;
    now: number;
  },
): ConversationSessionRecord {
  session.expiresAt = input.resetTimeout
    ? input.now + input.timeoutMs
    : session.expiresAt + input.timeoutMs;
  return session;
}

export function finishOwnedConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string,
  conversationId: string,
  now = Date.now(),
): boolean {
  const session = getOwnedConversationSession(sessions, pluginId, conversationId, now);
  if (!session) {
    return false;
  }

  sessions.delete(conversationId);
  return true;
}

export function toConversationSessionInfo(
  session: ConversationSessionRecord,
  now: number,
): PluginConversationSessionInfo {
  return {
    pluginId: session.pluginId,
    conversationId: session.conversationId,
    timeoutMs: Math.max(0, session.expiresAt - now),
    startedAt: new Date(session.startedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastMatchedAt: session.lastMatchedAt
      ? new Date(session.lastMatchedAt).toISOString()
      : null,
    captureHistory: session.captureHistory,
    historyMessages: session.historyMessages.map((message) => cloneMessageHookInfo(message)),
    ...(typeof session.metadata !== 'undefined'
      ? { metadata: toJsonValue(session.metadata) }
      : {}),
  };
}

export function runOwnedConversationSessionMethod(
  input:
    | {
      sessions: Map<string, ConversationSessionRecord>;
      pluginId: string;
      conversationId: string;
      now: number;
      sessionMethod: 'start';
      timeoutMs: number;
      captureHistory: boolean;
      metadata?: JsonValue;
    }
    | {
      sessions: Map<string, ConversationSessionRecord>;
      pluginId: string;
      conversationId: string;
      now: number;
      sessionMethod: 'keep';
      timeoutMs: number;
      resetTimeout: boolean;
    }
    | {
      sessions: Map<string, ConversationSessionRecord>;
      pluginId: string;
      conversationId: string;
      now: number;
      sessionMethod: 'get' | 'finish';
    },
): PluginConversationSessionInfo | boolean | null {
  if (input.sessionMethod === 'start') {
    const session = createConversationSessionRecord({
      pluginId: input.pluginId,
      conversationId: input.conversationId,
      timeoutMs: input.timeoutMs,
      captureHistory: input.captureHistory,
      metadata: input.metadata,
      now: input.now,
    });
    input.sessions.set(input.conversationId, session);
    return toConversationSessionInfo(session, input.now);
  }

  if (input.sessionMethod === 'finish') {
    return finishOwnedConversationSession(
      input.sessions,
      input.pluginId,
      input.conversationId,
      input.now,
    );
  }

  const session = getOwnedConversationSession(
    input.sessions,
    input.pluginId,
    input.conversationId,
    input.now,
  );
  if (!session) {
    return null;
  }
  if (input.sessionMethod === 'keep') {
    extendConversationSession(session, {
      timeoutMs: input.timeoutMs,
      resetTimeout: input.resetTimeout,
      now: input.now,
    });
  }

  return toConversationSessionInfo(session, input.now);
}

export function recordConversationSessionMessage(
  session: ConversationSessionRecord,
  message: PluginMessageHookInfo,
  now: number,
): PluginConversationSessionInfo {
  session.lastMatchedAt = now;
  if (session.captureHistory) {
    session.historyMessages.push(cloneMessageHookInfo(message));
  }

  return toConversationSessionInfo(session, now);
}

export function createConversationSessionMessageReceivedPayload(input: {
  session: ConversationSessionRecord;
  payload: MessageReceivedHookPayload;
  now: number;
}): MessageReceivedHookPayload {
  const payload = cloneMessageReceivedHookPayload(input.payload);
  payload.session = recordConversationSessionMessage(
    input.session,
    payload.message,
    input.now,
  );
  return payload;
}

export function syncConversationSessionMessageReceivedPayload(input: {
  sessions: Map<string, ConversationSessionRecord>;
  session: ConversationSessionRecord;
  payload: MessageReceivedHookPayload;
  now: number;
}): MessageReceivedHookPayload {
  return {
    ...input.payload,
    session:
      getActiveConversationSessionInfo(
        input.sessions,
        input.session.conversationId,
        input.now,
      ) ?? input.payload.session,
  };
}

export function listActiveConversationSessionInfos(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string | undefined,
  now: number,
): PluginConversationSessionInfo[] {
  const infos: PluginConversationSessionInfo[] = [];
  for (const conversationId of sessions.keys()) {
    const session = getActiveConversationSession(sessions, conversationId, now);
    if (!session) {
      continue;
    }
    if (pluginId && session.pluginId !== pluginId) {
      continue;
    }

    infos.push(toConversationSessionInfo(session, now));
  }

  return infos.sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
}
