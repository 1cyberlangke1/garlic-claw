import type {
  PluginCronDescriptor,
  PluginHookDescriptor,
  PluginHookFilterDescriptor,
  PluginHookMessageFilter,
  PluginMessageKind,
} from '@garlic-claw/shared';
import {
  isJsonValue,
  isOneOf,
  readArray,
  readRecord,
  readStringArray,
} from './plugin-manifest-normalize-base.helpers';

const PLUGIN_HOOK_NAMES: PluginHookDescriptor['name'][] = [
  'message:received',
  'chat:before-model',
  'chat:waiting-model',
  'chat:after-model',
  'conversation:created',
  'message:created',
  'message:updated',
  'message:deleted',
  'automation:before-run',
  'automation:after-run',
  'subagent:before-run',
  'subagent:after-run',
  'tool:before-call',
  'tool:after-call',
  'response:before-send',
  'response:after-send',
  'plugin:loaded',
  'plugin:unloaded',
  'plugin:error',
  'cron:tick',
];

const PLUGIN_MESSAGE_KINDS: PluginMessageKind[] = [
  'text',
  'image',
  'mixed',
];

export function readPluginHookDescriptor(value: unknown): PluginHookDescriptor | null {
  const record = readRecord(value);
  if (!record || !isOneOf(record.name, PLUGIN_HOOK_NAMES)) {
    return null;
  }

  const hook: PluginHookDescriptor = {
    name: record.name,
  };

  if (typeof record.description === 'string') {
    hook.description = record.description;
  }
  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    hook.priority = record.priority;
  }

  const filter = readPluginHookFilterDescriptor(record.filter);
  if (filter) {
    hook.filter = filter;
  }

  return hook;
}

export function readPluginCronDescriptor(value: unknown): PluginCronDescriptor | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.name !== 'string'
    || typeof record.cron !== 'string'
  ) {
    return null;
  }

  const cron: PluginCronDescriptor = {
    name: record.name,
    cron: record.cron,
  };

  if (typeof record.description === 'string') {
    cron.description = record.description;
  }
  if (typeof record.enabled === 'boolean') {
    cron.enabled = record.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'data') && isJsonValue(record.data)) {
    cron.data = record.data;
  }

  return cron;
}

function readPluginHookFilterDescriptor(
  value: unknown,
): PluginHookFilterDescriptor | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const message = readPluginHookMessageFilter(record.message);
  if (!message) {
    return null;
  }

  return {
    message,
  };
}

function readPluginHookMessageFilter(
  value: unknown,
): PluginHookMessageFilter | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const filter: PluginHookMessageFilter = {};
  const commands = readStringArray(record.commands);
  if (commands.length > 0) {
    filter.commands = commands;
  }

  const regex = readHookRegex(record.regex);
  if (regex) {
    filter.regex = regex;
  }

  const messageKinds = readArray(record.messageKinds, readPluginMessageKind);
  if (messageKinds.length > 0) {
    filter.messageKinds = messageKinds;
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

function readHookRegex(
  value: unknown,
): PluginHookMessageFilter['regex'] | null {
  if (typeof value === 'string') {
    return value;
  }

  const record = readRecord(value);
  if (!record || typeof record.pattern !== 'string') {
    return null;
  }

  return {
    pattern: record.pattern,
    ...(typeof record.flags === 'string' ? { flags: record.flags } : {}),
  };
}

function readPluginMessageKind(value: unknown): PluginMessageKind | null {
  return isOneOf(value, PLUGIN_MESSAGE_KINDS) ? value : null;
}
