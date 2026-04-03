import {
  createConversationSessionMessageReceivedPayload,
  createConversationSessionRecord,
  extendConversationSession,
  finishOwnedConversationSession,
  getActiveConversationSession,
  getActiveConversationSessionInfo,
  getOwnedConversationSession,
  syncConversationSessionMessageReceivedPayload,
  toConversationSessionInfo,
} from '@garlic-claw/shared';
import type {
  MessageReceivedHookPayload,
  PluginCallContext,
  PluginConversationSessionInfo,
  PluginHookName,
  PluginManifest,
  JsonValue,
  ConversationSessionRecord,
} from '@garlic-claw/shared';
import type { PluginGovernanceSnapshot } from './plugin.service';
import { isRuntimeRecordEnabledForContext } from './plugin-runtime-dispatch.helpers';
import { requireRuntimeConversationId } from './plugin-runtime-input.helpers';
import { findManifestHookDescriptor } from './plugin-runtime-manifest.helpers';

type ConversationSessionDispatchRecord = {
  manifest: PluginManifest;
  governance: Pick<PluginGovernanceSnapshot, 'scope'>;
};

export function getDispatchableConversationSessionRecord<
  T extends ConversationSessionDispatchRecord,
>(input: {
  sessions: Map<string, ConversationSessionRecord>;
  records: ReadonlyMap<string, T>;
  conversationId: string | undefined;
  context: PluginCallContext;
  hookName: PluginHookName;
  now: number;
}): { session: ConversationSessionRecord; record: T } | null {
  const session = getActiveConversationSession(
    input.sessions,
    input.conversationId,
    input.now,
  );
  if (!session) {
    return null;
  }

  const record = input.records.get(session.pluginId);
  if (
    !record
    || !isRuntimeRecordEnabledForContext(record, input.context)
    || !findManifestHookDescriptor(record.manifest, input.hookName)
  ) {
    input.sessions.delete(session.conversationId);
    return null;
  }

  return {
    session,
    record,
  };
}

export function prepareDispatchableConversationSessionMessageReceivedHook<
  T extends ConversationSessionDispatchRecord,
>(input: {
  sessions: Map<string, ConversationSessionRecord>;
  records: ReadonlyMap<string, T>;
  context: PluginCallContext;
  payload: MessageReceivedHookPayload;
  now: number;
}): { session: ConversationSessionRecord; record: T; payload: MessageReceivedHookPayload } | null {
  const matched = getDispatchableConversationSessionRecord({
    sessions: input.sessions,
    records: input.records,
    conversationId: input.payload.conversationId,
    context: input.context,
    hookName: 'message:received',
    now: input.now,
  });
  if (!matched) {
    return null;
  }

  return {
    ...matched,
    payload: createConversationSessionMessageReceivedPayload({
      session: matched.session,
      payload: input.payload,
      now: input.now,
    }),
  };
}

export function startConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  timeoutMs: number;
  captureHistory: boolean;
  metadata?: JsonValue;
  now: number;
}): PluginConversationSessionInfo {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const record = createConversationSessionRecord({
    pluginId: input.pluginId,
    conversationId,
    timeoutMs: input.timeoutMs,
    captureHistory: input.captureHistory,
    ...(typeof input.metadata !== 'undefined'
      ? { metadata: input.metadata }
      : {}),
    now: input.now,
  });
  input.sessions.set(conversationId, record);
  return toConversationSessionInfo(record, input.now);
}

export function getConversationSessionInfoForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  now: number;
}): PluginConversationSessionInfo | null {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const session = getOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
  return session ? toConversationSessionInfo(session, input.now) : null;
}

export function keepConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  timeoutMs: number;
  resetTimeout: boolean;
  now: number;
}): PluginConversationSessionInfo | null {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const session = getOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
  if (!session) {
    return null;
  }

  extendConversationSession(session, {
    timeoutMs: input.timeoutMs,
    resetTimeout: input.resetTimeout,
    now: input.now,
  });
  return toConversationSessionInfo(session, input.now);
}

export function finishConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  now?: number;
}): boolean {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  return finishOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
}
