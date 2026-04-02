import type {
  PluginCommandDescriptor,
  PluginRouteDescriptor,
  PluginRouteMethod,
} from '@garlic-claw/shared';
import {
  isOneOf,
  readArray,
  readRecord,
  readStringArray,
} from './plugin-manifest-normalize-base.helpers';

const PLUGIN_ROUTE_METHODS: PluginRouteMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

const PLUGIN_COMMAND_KINDS: PluginCommandDescriptor['kind'][] = [
  'command',
  'group-help',
];

export function readPluginRouteDescriptor(value: unknown): PluginRouteDescriptor | null {
  const record = readRecord(value);
  if (!record || typeof record.path !== 'string') {
    return null;
  }

  const methods = readArray(record.methods, readPluginRouteMethod);
  if (methods.length === 0) {
    return null;
  }

  return {
    path: record.path,
    methods,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
  };
}

export function readPluginCommandDescriptor(
  value: unknown,
): PluginCommandDescriptor | null {
  const record = readRecord(value);
  if (
    !record
    || !isOneOf(record.kind, PLUGIN_COMMAND_KINDS)
    || typeof record.canonicalCommand !== 'string'
  ) {
    return null;
  }

  const path = readStringArray(record.path);
  if (path.length === 0) {
    return null;
  }

  const command: PluginCommandDescriptor = {
    kind: record.kind,
    canonicalCommand: record.canonicalCommand,
    path,
    aliases: readStringArray(record.aliases),
    variants: readStringArray(record.variants),
  };

  if (typeof record.description === 'string') {
    command.description = record.description;
  }
  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    command.priority = record.priority;
  }

  return command;
}

function readPluginRouteMethod(value: unknown): PluginRouteMethod | null {
  return isOneOf(value, PLUGIN_ROUTE_METHODS) ? value : null;
}
