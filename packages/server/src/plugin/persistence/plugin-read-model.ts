import { createHash } from 'node:crypto';
import type { JsonObject, JsonValue, PluginActionName, PluginCommandCatalogVersion, PluginCommandConflict, PluginCommandInfo, PluginCommandOverview, PluginConfigNodeSchema, PluginConfigSnapshot, PluginInfo } from '@garlic-claw/shared';
import type { RegisteredPluginRecord } from './plugin-persistence.service';

type PluginCommandConflictEntry = PluginCommandConflict['commands'][number];
const PLUGIN_SELF_CAPABILITY_KEYS = ['tools', 'commands', 'crons', 'hooks', 'routes'] as const;

export function createPluginConfigSnapshot(record: RegisteredPluginRecord): PluginConfigSnapshot {
  return { schema: record.manifest.config ?? null, values: resolveConfigNodeValue(record.manifest.config ?? null, record.configValues ?? {}) as JsonObject };
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
    health: { status: record.connected ? 'healthy' : 'offline', failureCount: 0, consecutiveFailures: 0, lastError: null, lastErrorAt: null, lastSuccessAt: record.lastSeenAt, lastCheckedAt: record.lastSeenAt },
    id: record.pluginId,
    lastSeenAt: record.lastSeenAt,
    manifest: record.manifest,
    name: record.pluginId,
    remote: clonePluginRemote(record),
    runtimeKind: record.manifest.runtime,
    status: record.status,
    supportedActions,
    updatedAt: record.updatedAt,
    version: record.manifest.version,
  };
}

export function buildPluginSelfSummary(record: RegisteredPluginRecord): JsonObject {
  const remote = clonePluginRemote(record);
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
    ...(remote ? { remote: remote as unknown as JsonObject } : {}),
    runtimeKind: record.manifest.runtime,
    version: record.manifest.version,
    ...Object.fromEntries(PLUGIN_SELF_CAPABILITY_KEYS.flatMap((key) => record.manifest[key]?.length ? [[key, record.manifest[key]]] : [])) as unknown as JsonObject,
  };
}

export function listPluginCommands(record: RegisteredPluginRecord, connected: boolean): PluginCommandInfo[] {
  return (record.manifest.commands ?? []).map((command) => ({ ...command, aliases: [...command.aliases], variants: [...command.variants], path: [...command.path], commandId: `${record.pluginId}:${command.canonicalCommand}:${command.kind}`, conflictTriggers: [], connected, defaultEnabled: record.defaultEnabled, governance: record.governance, pluginDisplayName: record.manifest.name, pluginId: record.pluginId, runtimeKind: record.manifest.runtime, source: 'manifest' }));
}

export function buildPluginCommandConflicts(commands: PluginCommandInfo[]): PluginCommandConflict[] {
  const triggers = new Map<string, PluginCommandInfo[]>();
  for (const command of commands) {
    for (const trigger of command.variants) {
      const entries = triggers.get(trigger);
      if (entries) {
        entries.push(command);
        continue;
      }
      triggers.set(trigger, [command]);
    }
  }
  return [...triggers].flatMap(([trigger, entries]) => entries.length < 2 ? [] : [{ trigger, commands: entries.map(toPluginCommandConflictEntry) }]);
}

export function buildPluginCommandOverview(commands: PluginCommandInfo[]): PluginCommandOverview {
  const sortedCommands = [...commands].sort(comparePluginCommandIdentity);
  const conflicts = buildPluginCommandConflicts(sortedCommands).map((conflict) => ({ ...conflict, commands: [...conflict.commands].sort(comparePluginCommandIdentity) })).sort((left, right) => left.trigger.localeCompare(right.trigger));
  return { commands: sortedCommands, conflicts, version: createPluginCommandOverviewVersion(sortedCommands, conflicts) };
}

export function buildPluginCommandCatalogVersion(commands: PluginCommandInfo[]): PluginCommandCatalogVersion {
  return { version: buildPluginCommandOverview(commands).version };
}

function clonePluginRemote(record: RegisteredPluginRecord): PluginInfo['remote'] {
  return record.remote ? { access: { ...record.remote.access }, descriptor: structuredClone(record.remote.descriptor), metadataCache: { ...record.remote.metadataCache } } : null;
}

function toPluginCommandConflictEntry(command: PluginCommandInfo): PluginCommandConflictEntry {
  return { canonicalCommand: command.canonicalCommand, commandId: command.commandId, connected: command.connected, defaultEnabled: command.defaultEnabled, kind: command.kind, pluginDisplayName: command.pluginDisplayName, pluginId: command.pluginId, ...(typeof command.priority === 'number' ? { priority: command.priority } : {}), runtimeKind: command.runtimeKind };
}

function createPluginCommandOverviewVersion(commands: PluginCommandInfo[], conflicts: PluginCommandConflict[]): string {
  return createHash('sha1').update(JSON.stringify({
    commands: commands.map((command) => ({ aliases: command.aliases, canonicalCommand: command.canonicalCommand, commandId: command.commandId, conflictTriggers: command.conflictTriggers, connected: command.connected, defaultEnabled: command.defaultEnabled, governance: command.governance ?? null, kind: command.kind, path: command.path, pluginDisplayName: command.pluginDisplayName ?? null, pluginId: command.pluginId, priority: command.priority ?? null, runtimeKind: command.runtimeKind, source: command.source, variants: command.variants })),
    conflicts: conflicts.map((conflict) => ({ commands: conflict.commands.map((command) => ({ canonicalCommand: command.canonicalCommand, commandId: command.commandId, connected: command.connected, defaultEnabled: command.defaultEnabled, kind: command.kind, pluginDisplayName: command.pluginDisplayName ?? null, pluginId: command.pluginId, priority: command.priority ?? null, runtimeKind: command.runtimeKind })), trigger: conflict.trigger })),
  })).digest('hex');
}

function comparePluginCommandIdentity(left: Pick<PluginCommandInfo, 'canonicalCommand' | 'commandId' | 'kind' | 'pluginId' | 'priority'>, right: Pick<PluginCommandInfo, 'canonicalCommand' | 'commandId' | 'kind' | 'pluginId' | 'priority'>): number {
  return left.canonicalCommand.localeCompare(right.canonicalCommand) || left.kind.localeCompare(right.kind) || (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) || left.pluginId.localeCompare(right.pluginId) || left.commandId.localeCompare(right.commandId);
}

function resolveConfigNodeValue(schema: PluginConfigNodeSchema | null, currentValue: JsonValue | undefined): JsonValue | undefined {
  if (!schema) { return currentValue; }
  if (schema.type === 'object') {
    const source = isJsonObject(currentValue) ? currentValue : {};
    return Object.fromEntries(Object.entries(schema.items).flatMap(([key, childSchema]) => {
      const childValue = resolveConfigNodeValue(childSchema, source[key]);
      return typeof childValue === 'undefined' ? [] : [[key, childValue]];
    })) as JsonObject;
  }
  if (schema.type === 'list') {
    const sourceList = Array.isArray(currentValue) ? currentValue : Array.isArray(schema.defaultValue) ? schema.defaultValue : null;
    return sourceList ? (schema.items ? sourceList.map((item) => resolveConfigNodeValue(schema.items ?? null, item) ?? null) : sourceList) : schema.defaultValue ?? currentValue;
  }
  return typeof currentValue !== 'undefined' ? currentValue : schema.defaultValue;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
