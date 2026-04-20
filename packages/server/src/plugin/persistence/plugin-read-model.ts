import { createHash } from 'node:crypto';
import type {
  JsonObject,
  JsonValue,
  PluginActionName,
  PluginCommandCatalogVersion,
  PluginCommandConflict,
  PluginCommandOverview,
  PluginCommandInfo,
  PluginConfigNodeSchema,
  PluginConfigSnapshot,
  PluginInfo,
} from '@garlic-claw/shared';
import type { RegisteredPluginRecord } from './plugin-persistence.service';

export function createPluginConfigSnapshot(record: RegisteredPluginRecord): PluginConfigSnapshot {
  return {
    schema: record.manifest.config ?? null,
    values: resolvePluginConfigValues(record),
  };
}

export function buildPluginInfo(record: RegisteredPluginRecord, supportedActions: PluginActionName[]): PluginInfo {
  return {
    connected: record.connected,
    defaultEnabled: record.defaultEnabled,
    createdAt: record.createdAt,
    eventLog: { ...record.eventLog },
    ...(record.manifest.description ? { description: record.manifest.description } : {}),
    displayName: record.manifest.name,
    governance: record.governance,
    health: {
      status: record.connected ? 'healthy' : 'offline',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: record.lastSeenAt,
      lastCheckedAt: record.lastSeenAt,
    },
    id: record.pluginId,
    lastSeenAt: record.lastSeenAt,
    manifest: record.manifest,
    name: record.pluginId,
    runtimeKind: record.manifest.runtime,
    status: record.status,
    supportedActions,
    updatedAt: record.updatedAt,
    version: record.manifest.version,
    remote: record.remote ? {
      access: { ...record.remote.access },
      descriptor: structuredClone(record.remote.descriptor),
      metadataCache: { ...record.remote.metadataCache },
    } : null,
  };
}

export function buildPluginSelfSummary(record: RegisteredPluginRecord): JsonObject {
  const capabilities = Object.fromEntries(([
    ['tools', record.manifest.tools],
    ['commands', record.manifest.commands],
    ['crons', record.manifest.crons],
    ['hooks', record.manifest.hooks],
    ['routes', record.manifest.routes],
  ] as const).flatMap(([key, value]) => value?.length ? [[key, value]] : [])) as unknown as JsonObject;
  return {
    connected: record.connected,
    defaultEnabled: record.defaultEnabled,
    eventLog: { ...record.eventLog } as unknown as JsonObject,
    ...(record.manifest.description ? { description: record.manifest.description } : {}),
    governance: record.governance as unknown as JsonObject,
    id: record.manifest.id,
    lastSeenAt: record.lastSeenAt,
    name: record.manifest.name,
    permissions: [...record.manifest.permissions],
    ...(record.remote ? {
      remote: {
        access: { ...record.remote.access },
        descriptor: structuredClone(record.remote.descriptor),
        metadataCache: { ...record.remote.metadataCache },
      } as unknown as JsonObject,
    } : {}),
    runtimeKind: record.manifest.runtime,
    version: record.manifest.version,
    ...capabilities,
  };
}

export function listPluginCommands(record: RegisteredPluginRecord, connected: boolean): PluginCommandInfo[] {
  return (record.manifest.commands ?? []).map((command) => ({
    ...command,
    aliases: [...command.aliases],
    variants: [...command.variants],
    path: [...command.path],
    commandId: `${record.pluginId}:${command.canonicalCommand}:${command.kind}`,
    conflictTriggers: [],
    connected,
    defaultEnabled: record.defaultEnabled,
    pluginDisplayName: record.manifest.name,
    pluginId: record.pluginId,
    runtimeKind: record.manifest.runtime,
    source: 'manifest' as const,
    governance: record.governance,
  }));
}

export function buildPluginCommandConflicts(commands: PluginCommandInfo[]): PluginCommandConflict[] {
  const triggerMap = new Map<string, PluginCommandInfo[]>();
  for (const command of commands) {
    for (const trigger of command.variants) {
      const entries = triggerMap.get(trigger) ?? [];
      entries.push(command);
      triggerMap.set(trigger, entries);
    }
  }
  return [...triggerMap.entries()]
    .map(([trigger, relatedCommands]) => ({
      trigger,
      commands: relatedCommands.map((command) => ({
        commandId: command.commandId,
        pluginId: command.pluginId,
        pluginDisplayName: command.pluginDisplayName,
        runtimeKind: command.runtimeKind,
        connected: command.connected,
        defaultEnabled: command.defaultEnabled,
        kind: command.kind,
        canonicalCommand: command.canonicalCommand,
        ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
      })),
    }))
    .filter((conflict) => conflict.commands.length > 1);
}

export function buildPluginCommandOverview(commands: PluginCommandInfo[]): PluginCommandOverview {
  const sortedCommands = [...commands].sort(comparePluginCommandsForCatalog);
  const conflicts = buildPluginCommandConflicts(sortedCommands)
    .map((conflict) => ({
      ...conflict,
      commands: [...conflict.commands].sort(comparePluginCommandConflictEntriesForCatalog),
    }))
    .sort(comparePluginCommandConflictsForCatalog);
  return {
    version: createPluginCommandOverviewVersion({
      commands: sortedCommands,
      conflicts,
    }),
    commands: sortedCommands,
    conflicts,
  };
}

export function buildPluginCommandCatalogVersion(commands: PluginCommandInfo[]): PluginCommandCatalogVersion {
  return {
    version: buildPluginCommandOverview(commands).version,
  };
}

function resolvePluginConfigValues(record: RegisteredPluginRecord): JsonObject {
  return resolveConfigNodeValue(
    record.manifest.config ?? null,
    record.configValues ?? {},
  ) as JsonObject;
}

function createPluginCommandOverviewVersion(overview: {
  commands: PluginCommandInfo[];
  conflicts: PluginCommandConflict[];
}): string {
  return createHash('sha1')
    .update(
      JSON.stringify({
        commands: overview.commands.map((command) => ({
          aliases: command.aliases,
          canonicalCommand: command.canonicalCommand,
          commandId: command.commandId,
          conflictTriggers: command.conflictTriggers,
          connected: command.connected,
          defaultEnabled: command.defaultEnabled,
          governance: command.governance ?? null,
          kind: command.kind,
          path: command.path,
          pluginDisplayName: command.pluginDisplayName ?? null,
          pluginId: command.pluginId,
          priority: command.priority ?? null,
          runtimeKind: command.runtimeKind,
          source: command.source,
          variants: command.variants,
        })),
        conflicts: overview.conflicts.map((conflict) => ({
          commands: conflict.commands.map((command) => ({
            canonicalCommand: command.canonicalCommand,
            commandId: command.commandId,
            connected: command.connected,
            defaultEnabled: command.defaultEnabled,
            kind: command.kind,
            pluginDisplayName: command.pluginDisplayName ?? null,
            pluginId: command.pluginId,
            priority: command.priority ?? null,
            runtimeKind: command.runtimeKind,
          })),
          trigger: conflict.trigger,
        })),
      }),
    )
    .digest('hex');
}

function comparePluginCommandsForCatalog(left: PluginCommandInfo, right: PluginCommandInfo): number {
  return compareValues(left.canonicalCommand, right.canonicalCommand)
    || compareValues(left.kind, right.kind)
    || compareNumbers(left.priority, right.priority)
    || compareValues(left.pluginId, right.pluginId)
    || compareValues(left.commandId, right.commandId);
}

function comparePluginCommandConflictsForCatalog(left: PluginCommandConflict, right: PluginCommandConflict): number {
  return compareValues(left.trigger, right.trigger);
}

function comparePluginCommandConflictEntriesForCatalog(
  left: PluginCommandConflict['commands'][number],
  right: PluginCommandConflict['commands'][number],
): number {
  return compareValues(left.canonicalCommand, right.canonicalCommand)
    || compareValues(left.kind, right.kind)
    || compareNumbers(left.priority, right.priority)
    || compareValues(left.pluginId, right.pluginId)
    || compareValues(left.commandId, right.commandId);
}

function compareNumbers(left: number | undefined, right: number | undefined): number {
  return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
}

function compareValues(left: string, right: string): number {
  return left.localeCompare(right);
}

function resolveConfigNodeValue(
  schema: PluginConfigNodeSchema | null,
  currentValue: JsonValue | undefined,
): JsonValue | undefined {
  if (!schema) {
    return currentValue;
  }

  if (schema.type === 'object') {
    const source = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? currentValue as JsonObject
      : {};
    const result: JsonObject = {};

    for (const [key, childSchema] of Object.entries(schema.items)) {
      const childValue = resolveConfigNodeValue(childSchema, source[key]);
      if (typeof childValue !== 'undefined') {
        result[key] = childValue;
      }
    }

    return result;
  }

  if (schema.type === 'list') {
    const sourceList = Array.isArray(currentValue)
      ? currentValue
      : Array.isArray(schema.defaultValue)
        ? schema.defaultValue
        : null;
    if (sourceList) {
      const itemSchema = schema.items;
      if (!itemSchema) {
        return sourceList;
      }
      return sourceList.map((item) => resolveConfigNodeValue(itemSchema, item) ?? null);
    }
    return typeof schema.defaultValue !== 'undefined' ? schema.defaultValue : currentValue;
  }

  if (typeof currentValue !== 'undefined') {
    return currentValue;
  }
  return typeof schema.defaultValue !== 'undefined' ? schema.defaultValue : undefined;
}
