import type {
  PluginCallContext,
  PluginHookDescriptor,
  PluginHookName,
  PluginManifest,
  PluginMessageKind,
  PluginScopeSettings,
} from './types/plugin';
import type { JsonValue } from './types/json';
import type { MessageReceivedHookPayload } from './types/plugin-ai';
import { toJsonValue } from './types/json';
import { findManifestHookDescriptor } from './plugin-runtime-manifest.helpers';
import {
  buildFilterRegex,
  matchesMessageCommand,
} from './plugin-runtime-validation.helpers';

export function isPluginEnabledForContext(
  scope: PluginScopeSettings,
  context: Pick<PluginCallContext, 'conversationId'>,
): boolean {
  const conversationId = context.conversationId;
  if (conversationId) {
    const scoped = scope.conversations[conversationId];
    if (typeof scoped === 'boolean') {
      return scoped;
    }
  }

  return scope.defaultEnabled;
}

export function collectDisabledConversationSessionIds(input: {
  sessions: Iterable<{
    pluginId: string;
    conversationId: string;
  }>;
  pluginId: string;
  scope: PluginScopeSettings;
}): string[] {
  const conversationIds: string[] = [];
  for (const session of input.sessions) {
    if (session.pluginId !== input.pluginId) {
      continue;
    }
    if (!isPluginEnabledForContext(input.scope, { conversationId: session.conversationId })) {
      conversationIds.push(session.conversationId);
    }
  }

  return conversationIds;
}

export function getPluginHookPriority(hook: PluginHookDescriptor): number {
  if (typeof hook.priority !== 'number' || !Number.isFinite(hook.priority)) {
    return 0;
  }

  return Math.trunc(hook.priority);
}

export function getMessageReceivedText(payload: MessageReceivedHookPayload): string {
  if (typeof payload.message.content === 'string') {
    return payload.message.content;
  }

  return payload.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function detectMessageKind(
  message: MessageReceivedHookPayload['message'],
): PluginMessageKind {
  const hasImage = message.parts.some((part) => part.type === 'image');
  const hasTextPart = message.parts.some((part) => part.type === 'text');
  const hasText = hasTextPart || Boolean(message.content?.trim());

  if (hasImage && hasText) {
    return 'mixed';
  }
  if (hasImage) {
    return 'image';
  }

  return 'text';
}

export function matchesHookFilter(
  hook: PluginHookDescriptor,
  hookName: PluginHookName,
  payload?: unknown,
): boolean {
  if (hookName !== 'message:received' || !hook.filter?.message) {
    return true;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const messagePayload = payload as MessageReceivedHookPayload;
  const filter = hook.filter.message;
  const messageText = getMessageReceivedText(messagePayload);
  const messageKind = detectMessageKind(messagePayload.message);

  if (
    Array.isArray(filter.commands)
    && filter.commands.length > 0
    && !filter.commands.some((command) => matchesMessageCommand(messageText, command))
  ) {
    return false;
  }

  if (filter.regex) {
    const regex = buildFilterRegex(filter.regex);
    if (!regex.test(messageText)) {
      return false;
    }
  }

  if (
    Array.isArray(filter.messageKinds)
    && filter.messageKinds.length > 0
    && !filter.messageKinds.includes(messageKind)
  ) {
    return false;
  }

  return true;
}

type RuntimeDispatchRecord = {
  manifest: PluginManifest;
  governance: {
    scope: PluginScopeSettings;
  };
};

export function isRuntimeRecordEnabledForContext(
  record: RuntimeDispatchRecord,
  context: PluginCallContext,
): boolean {
  return isPluginEnabledForContext(record.governance.scope, context);
}

export function listDispatchableHookRecords<T extends RuntimeDispatchRecord>(input: {
  records: Iterable<T>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload?: unknown;
}): T[] {
  return [...input.records]
    .map((record) => ({
      record,
      hook: findManifestHookDescriptor(record.manifest, input.hookName),
    }))
    .filter((entry): entry is { record: T; hook: PluginHookDescriptor } =>
      entry.hook !== null,
    )
    .filter((entry) =>
      isRuntimeRecordEnabledForContext(entry.record, input.context)
      && matchesHookFilter(entry.hook, input.hookName, input.payload),
    )
    .sort((left, right) => {
      const priorityDiff = getPluginHookPriority(left.hook) - getPluginHookPriority(right.hook);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.record.manifest.id.localeCompare(right.record.manifest.id);
    })
    .map((entry) => entry.record);
}

export async function invokeDispatchableHooks<
  T extends RuntimeDispatchRecord,
  TResult,
>(input: {
  records: Iterable<T>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload?: unknown;
  invoke: (record: T, payload: JsonValue) => Promise<TResult>;
}): Promise<TResult[]> {
  const results: TResult[] = [];
  const payload = toJsonValue(input.payload);

  for (const record of listDispatchableHookRecords({
    records: input.records,
    hookName: input.hookName,
    context: input.context,
    payload: input.payload,
  })) {
    try {
      results.push(await input.invoke(record, payload));
    } catch {
      // 单个 Hook 失败时继续执行后续插件。
    }
  }

  return results;
}
