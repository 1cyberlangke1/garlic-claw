import type {
  JsonValue,
  PluginCapability,
  PluginCommandDescriptor,
  PluginConfigConditionValue,
  PluginConfigNodeSchema,
  PluginConfigOptionSchema,
  PluginConfigRenderType,
  PluginConfigSchema,
  PluginCronDescriptor,
  PluginHookDescriptor,
  PluginManifest,
  PluginPermission,
  PluginRemoteAccessConfig,
  PluginRemoteDescriptor,
  RemotePluginConnectionInfo,
  PluginRouteDescriptor,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { Injectable, Optional } from '@nestjs/common';
import { BuiltinPluginRegistryService } from '../builtin/builtin-plugin-registry.service';
import { PluginGovernanceService, type PluginGovernanceOverrides } from '../governance/plugin-governance.service';
import {
  PluginPersistenceService,
  type RegisteredPluginRecord,
  type RegisteredPluginRemoteRecord,
} from '../persistence/plugin-persistence.service';

export interface RegisterPluginInput {
  connected?: boolean;
  fallback: PluginManifestFallback;
  governance?: PluginGovernanceOverrides;
  manifest?: Partial<PluginManifest> | null;
  remote?: RegisteredPluginRemoteRecord | null;
}

export interface UpsertRemotePluginInput {
  access: PluginRemoteAccessConfig;
  description?: string;
  displayName?: string;
  pluginName: string;
  remote: PluginRemoteDescriptor;
  version?: string;
}

export interface PluginManifestFallback {
  description?: string;
  id: string;
  name?: string;
  remote?: PluginRemoteDescriptor;
  runtime?: PluginRuntimeKind;
  version?: string;
}

@Injectable()
export class PluginBootstrapService {
  constructor(
    private readonly pluginGovernanceService: PluginGovernanceService,
    private readonly pluginPersistenceService: PluginPersistenceService,
    @Optional()
    private readonly builtinPluginRegistryService?: BuiltinPluginRegistryService,
  ) {}

  getPlugin(pluginId: string): RegisteredPluginRecord { return this.pluginPersistenceService.getPluginOrThrow(pluginId); }

  listPlugins(): RegisteredPluginRecord[] { return this.pluginPersistenceService.listPlugins(); }

  bootstrapBuiltins(): string[] {
    return this.builtinPluginRegistryService
      ? this.builtinPluginRegistryService
          .listDefinitions()
          .map((definition) => this.registerBuiltinDefinition(definition).pluginId)
      : [];
  }

  markPluginOffline(pluginId: string): RegisteredPluginRecord { return this.pluginPersistenceService.setConnectionState(pluginId, false); }

  registerPlugin(input: RegisterPluginInput): RegisteredPluginRecord {
    const manifest = normalizePluginManifest(input.manifest, input.fallback);
    const existing = this.pluginPersistenceService.findPlugin(manifest.id);
    const governance = this.pluginGovernanceService.createState({ manifest, overrides: input.governance });
    const remote = normalizeRemoteRecord(manifest, input.remote ?? existing?.remote ?? null);

    return this.pluginPersistenceService.upsertPlugin({
      connected: input.connected ?? true,
      configValues: existing?.configValues,
      conversationScopes: existing?.conversationScopes,
      defaultEnabled: existing?.defaultEnabled ?? governance.defaultEnabled,
      governance: governance.governance,
      lastSeenAt: input.connected === false ? existing?.lastSeenAt ?? null : new Date().toISOString(),
      llmPreference: existing?.llmPreference,
      manifest,
      pluginId: manifest.id,
      remote,
    });
  }

  upsertRemotePlugin(input: UpsertRemotePluginInput): RegisteredPluginRecord {
    const normalized = normalizeRemotePluginInput(input);
    const existing = this.pluginPersistenceService.findPlugin(normalized.pluginName);
    const cachedManifest = existing?.manifest.runtime === 'remote'
      ? existing.manifest
      : null;

    return this.registerPlugin({
      connected: false,
      fallback: {
        description: normalized.description,
        id: normalized.pluginName,
        name: normalized.displayName ?? normalized.pluginName,
        remote: normalized.remote,
        runtime: 'remote',
        version: normalized.version,
      },
      manifest: cachedManifest ?? {
        id: normalized.pluginName,
        name: normalized.displayName ?? normalized.pluginName,
        permissions: [],
        remote: normalized.remote,
        runtime: 'remote',
        tools: [],
        version: normalized.version ?? '0.0.0',
      },
      remote: {
        access: normalized.access,
        descriptor: normalized.remote,
        metadataCache: existing?.remote?.metadataCache ?? {
          lastSyncedAt: null,
          manifestHash: null,
          status: 'empty',
        },
      },
    });
  }

  reloadBuiltin(pluginId: string): string {
    if (!this.builtinPluginRegistryService) {throw new Error('Builtin plugin registry is unavailable');}
    return this.registerBuiltinDefinition(this.builtinPluginRegistryService.getDefinition(pluginId)).pluginId;
  }

  touchHeartbeat(pluginId: string, seenAt: string = new Date().toISOString()): RegisteredPluginRecord {
    return this.pluginPersistenceService.touchHeartbeat(pluginId, seenAt);
  }

  private registerBuiltinDefinition(
    definition: ReturnType<BuiltinPluginRegistryService['getDefinition']>,
  ): RegisteredPluginRecord {
    return this.registerPlugin({
      fallback: {
        id: definition.manifest.id,
        name: definition.manifest.name,
        runtime: 'local',
        version: definition.manifest.version,
      },
      governance: definition.governance,
      manifest: definition.manifest,
    });
  }
}

function normalizeRemotePluginInput(
  input: UpsertRemotePluginInput,
): UpsertRemotePluginInput {
  return {
    access: {
      accessKey: input.access.accessKey?.trim() ? input.access.accessKey.trim() : null,
      serverUrl: input.access.serverUrl?.trim() ? input.access.serverUrl.trim() : null,
    },
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    pluginName: input.pluginName.trim(),
    remote: structuredClone(input.remote),
    ...(input.version?.trim() ? { version: input.version.trim() } : {}),
  };
}

export function normalizePluginManifest(
  candidate: Partial<PluginManifest> | null | undefined,
  fallback: PluginManifestFallback,
): PluginManifest {
  const source = readManifestRecord(candidate);
  const manifest: PluginManifest = {
    id: readNonEmptyString(source?.id) ?? fallback.id,
    name: readNonEmptyString(source?.name) ?? fallback.name ?? fallback.id,
    version: readNonEmptyString(source?.version) ?? fallback.version ?? '0.0.0',
    runtime: readRuntimeKind(source?.runtime) ?? fallback.runtime ?? 'remote',
    permissions: readManifestArray<PluginPermission>(source?.permissions),
    tools: readManifestArray<PluginCapability>(source?.tools),
  };

  const description = readNonEmptyString(source?.description) ?? fallback.description;
  const commands = readManifestArray<PluginCommandDescriptor>(source?.commands);
  const crons = readManifestArray<PluginCronDescriptor>(source?.crons);
  const hooks = readManifestArray<PluginHookDescriptor>(source?.hooks);
  const routes = readManifestArray<PluginRouteDescriptor>(source?.routes);
  if (description) {manifest.description = description;}
  if (commands.length > 0) {manifest.commands = commands;}
  if (crons.length > 0) {manifest.crons = crons;}
  if (hooks.length > 0) {manifest.hooks = hooks;}
  if (routes.length > 0) {manifest.routes = routes;}
  const config = readConfig(source?.config);
  if (config) {manifest.config = config;}
  const remote = readRemoteDescriptor(source?.remote) ?? fallback.remote;
  if (manifest.runtime === 'remote' && remote) {
    manifest.remote = structuredClone(remote);
  }

  return manifest;
}

export function buildRemotePluginConnectionInfo(record: RegisteredPluginRecord): RemotePluginConnectionInfo {
  if (!record.remote) {
    throw new Error(`Plugin ${record.pluginId} is not a remote plugin`);
  }
  return {
    accessKey: record.remote.access.accessKey,
    pluginName: record.pluginId,
    remote: structuredClone(record.remote.descriptor),
    serverUrl: record.remote.access.serverUrl ?? '',
  };
}

function readManifestRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {return null;}
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readRuntimeKind(value: unknown): PluginRuntimeKind | null {
  return value === 'local' || value === 'remote' ? value : null;
}

function readManifestArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...value] as T[] : [];
}

function readConfig(value: unknown): PluginConfigSchema | null {
  const node = readConfigNode(value);
  return node?.type === 'object' ? node : null;
}

function readRemoteDescriptor(value: unknown): PluginRemoteDescriptor | null {
  const record = readManifestRecord(value);
  if (!record) {
    return null;
  }
  const remoteEnvironment = record.remoteEnvironment === 'api' || record.remoteEnvironment === 'iot'
    ? record.remoteEnvironment
    : null;
  const capabilityProfile = record.capabilityProfile === 'query'
    || record.capabilityProfile === 'actuate'
    || record.capabilityProfile === 'hybrid'
    ? record.capabilityProfile
    : null;
  const authRecord = readManifestRecord(record.auth);
  const authMode = authRecord?.mode === 'none'
    || authRecord?.mode === 'optional'
    || authRecord?.mode === 'required'
    ? authRecord.mode
    : null;
  if (!remoteEnvironment || !capabilityProfile || !authMode) {
    return null;
  }
  return {
    auth: { mode: authMode },
    capabilityProfile,
    remoteEnvironment,
  };
}

function readConfigNode(value: unknown): PluginConfigNodeSchema | null {
  const record = readManifestRecord(value);
  if (!record) {return null;}
  const type = readConfigNodeType(record.type);
  if (!type) {return null;}
  const description = readNonEmptyString(record.description);
  const hint = readNonEmptyString(record.hint);
  const renderType = readConfigRenderType(record.renderType);
  const editorLanguage = readNonEmptyString(record.editorLanguage);
  const editorTheme = readNonEmptyString(record.editorTheme);
  const specialType = readNonEmptyString(record.specialType);

  const base = {
    type,
    ...(description ? { description } : {}),
    ...(hint ? { hint } : {}),
    ...(typeof record.obviousHint === 'boolean' ? { obviousHint: record.obviousHint } : {}),
    ...(typeof record.invisible === 'boolean' ? { invisible: record.invisible } : {}),
    ...(typeof record.collapsed === 'boolean' ? { collapsed: record.collapsed } : {}),
    ...(renderType ? { renderType } : {}),
    ...(typeof record.editorMode === 'boolean' ? { editorMode: record.editorMode } : {}),
    ...(editorLanguage ? { editorLanguage } : {}),
    ...(editorTheme ? { editorTheme } : {}),
    ...(specialType ? { specialType } : {}),
    ...(typeof record.secret === 'boolean' ? { secret: record.secret } : {}),
    ...(isJsonValue(record.defaultValue) ? { defaultValue: structuredClone(record.defaultValue) } : {}),
  };

  const condition = readConfigCondition(record.condition);
  const options = readConfigOptions(record.options);

  if (type === 'object') {
    const items = readConfigItems(record.items);
    if (Object.keys(items).length === 0) {return null;}
    return {
      ...base,
      ...(condition ? { condition } : {}),
      ...(options.length > 0 ? { options } : {}),
      items,
      type,
    };
  }

  if (type === 'list') {
    const itemSchema = readConfigNode(record.items);
    return {
      ...base,
      ...(condition ? { condition } : {}),
      ...(options.length > 0 ? { options } : {}),
      ...(itemSchema ? { items: itemSchema } : {}),
      type,
    };
  }

  return {
    ...base,
    ...(condition ? { condition } : {}),
    ...(options.length > 0 ? { options } : {}),
    type,
  };
}

function readConfigNodeType(value: unknown): PluginConfigNodeSchema['type'] | null {
  return value === 'string'
    || value === 'text'
    || value === 'int'
    || value === 'float'
    || value === 'bool'
    || value === 'object'
    || value === 'list'
    ? value
    : null;
}

function readConfigItems(value: unknown): Record<string, PluginConfigNodeSchema> {
  const record = readManifestRecord(value);
  if (!record) {return {};}
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, itemValue]) => [key, readConfigNode(itemValue)] as const)
      .filter((entry): entry is [string, PluginConfigNodeSchema] => entry[1] !== null),
  );
}

function readConfigCondition(value: unknown): Record<string, PluginConfigConditionValue> | null {
  const record = readManifestRecord(value);
  if (!record) {return null;}
  const entries = Object.entries(record)
    .filter((entry): entry is [string, PluginConfigConditionValue] =>
      typeof entry[1] === 'string'
      || typeof entry[1] === 'number'
      || typeof entry[1] === 'boolean'
      || entry[1] === null,
    );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function readConfigOptions(value: unknown): PluginConfigOptionSchema[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readConfigOption(item))
    .filter((item): item is PluginConfigOptionSchema => item !== null);
}

function readConfigOption(value: unknown): PluginConfigOptionSchema | null {
  const record = readManifestRecord(value);
  if (!record) {
    return null;
  }
  const optionValue = readNonEmptyString(record.value);
  if (!optionValue) {
    return null;
  }
  const label = readNonEmptyString(record.label);
  const description = readNonEmptyString(record.description);
  return {
    value: optionValue,
    ...(label ? { label } : {}),
    ...(description ? { description } : {}),
  };
}

function readConfigRenderType(value: unknown): PluginConfigRenderType | null {
  return value === 'checkbox' || value === 'select'
    ? value
    : null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {return true;}
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {return true;}
  if (Array.isArray(value)) {return value.every((item) => isJsonValue(item));}
  if (typeof value === 'object') {
    return Object.values(value).every((item) => typeof item !== 'undefined' && isJsonValue(item));
  }
  return false;
}

function normalizeRemoteRecord(
  manifest: PluginManifest,
  remote: RegisteredPluginRemoteRecord | null,
): RegisteredPluginRemoteRecord | null {
  if (manifest.runtime !== 'remote') {
    return null;
  }
  const descriptor = manifest.remote ?? remote?.descriptor;
  if (!descriptor) {
    return null;
  }
  return {
    access: {
      accessKey: remote?.access.accessKey ?? null,
      serverUrl: remote?.access.serverUrl ?? null,
    },
    descriptor,
    metadataCache: remote?.metadataCache ?? {
      lastSyncedAt: null,
      manifestHash: null,
      status: 'empty',
    },
  };
}
