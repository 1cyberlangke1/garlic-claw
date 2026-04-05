import type {
  PluginCommandDescriptor,
  PluginRouteDescriptor,
  PluginRouteMethod,
} from '@garlic-claw/shared';
import {
  PLUGIN_MANIFEST_COMMAND_KIND_VALUES,
  PLUGIN_ROUTE_METHOD_VALUES,
} from '@garlic-claw/shared';
import {
  isOneOf,
  readArray,
  readRecord,
  readStringArray,
} from './plugin-manifest-normalize-base.helpers';

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
    || !isOneOf(record.kind, PLUGIN_MANIFEST_COMMAND_KIND_VALUES)
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
  return isOneOf(value, PLUGIN_ROUTE_METHOD_VALUES) ? value : null;
}
