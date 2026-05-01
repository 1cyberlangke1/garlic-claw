import type {
  JsonValue, PluginCapability, PluginCommandDescriptor, PluginConfigConditionValue, PluginConfigNodeSchema,
  PluginConfigOptionSchema, PluginConfigRenderType, PluginConfigSchema, PluginCronDescriptor, PluginHookDescriptor,
  PluginManifest, PluginPermission, PluginRemoteAccessConfig, PluginRemoteDescriptor, PluginRouteDescriptor,
  PluginRuntimeKind, RemotePluginConnectionInfo,
} from '@garlic-claw/shared';
import type {
  PluginAuthorDefinition,
  PluginAuthorTransportGovernanceHandlers,
} from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import { Injectable, Optional } from '@nestjs/common';
import { BuiltinPluginRegistryService } from '../builtin/builtin-plugin-registry.service';
import { PluginGovernanceService, type PluginGovernanceOverrides } from '../governance/plugin-governance.service';
import { PluginPersistenceService, type RegisteredPluginRecord, type RegisteredPluginRemoteRecord } from '../persistence/plugin-persistence.service';
import {
  ProjectPluginRegistryService,
  type ProjectPluginDefinitionRecord,
} from '../project/project-plugin-registry.service';

const CONFIG_NODE_TYPES = ['string', 'text', 'int', 'float', 'bool', 'object', 'list'] as const;
const CONFIG_RENDER_TYPES = ['checkbox', 'select'] as const;
const PLUGIN_RUNTIME_KINDS = ['local', 'remote'] as const;
const REMOTE_ENVIRONMENTS = ['api', 'iot'] as const;
const REMOTE_CAPABILITY_PROFILES = ['query', 'actuate', 'hybrid'] as const;
const REMOTE_AUTH_MODES = ['none', 'optional', 'required'] as const;
const CONFIG_TEXT_FIELDS = ['description', 'hint', 'editorLanguage', 'editorTheme', 'specialType'] as const;
const CONFIG_BOOLEAN_FIELDS = ['obviousHint', 'invisible', 'collapsed', 'editorMode', 'secret'] as const;
type ManifestRecord = Record<string, unknown>;

export interface RegisterPluginInput { connected?: boolean; fallback: PluginManifestFallback; governance?: PluginGovernanceOverrides; manifest?: Partial<PluginManifest> | null; remote?: RegisteredPluginRemoteRecord | null; }

export interface UpsertRemotePluginInput { access: PluginRemoteAccessConfig; description?: string; displayName?: string; pluginName: string; remote: PluginRemoteDescriptor; version?: string; }

export interface PluginManifestFallback { description?: string; id: string; name?: string; remote?: PluginRemoteDescriptor; runtime?: PluginRuntimeKind; version?: string; }

export interface LocalPluginDefinitionRecord {
  definition: PluginAuthorDefinition<PluginHostFacadeMethods>;
  source: 'builtin' | 'project';
  transportGovernance?: PluginAuthorTransportGovernanceHandlers;
}

@Injectable()
export class PluginBootstrapService {
  constructor(
    private readonly pluginGovernanceService: PluginGovernanceService,
    private readonly pluginPersistenceService: PluginPersistenceService,
    @Optional() private readonly builtinPluginRegistryService?: BuiltinPluginRegistryService,
    @Optional() private readonly projectPluginRegistryService?: ProjectPluginRegistryService,
  ) {}

  getPlugin(pluginId: string): RegisteredPluginRecord { return this.pluginPersistenceService.getPluginOrThrow(pluginId); }
  listPlugins(): RegisteredPluginRecord[] { return this.pluginPersistenceService.listPlugins(); }
  markPluginOffline(pluginId: string): RegisteredPluginRecord { return this.pluginPersistenceService.setConnectionState(pluginId, false); }
  touchHeartbeat(pluginId: string, seenAt: string = new Date().toISOString()): RegisteredPluginRecord { return this.pluginPersistenceService.touchHeartbeat(pluginId, seenAt); }
  bootstrapBuiltins(): string[] {
    if (!this.builtinPluginRegistryService) {
      return [];
    }
    this.pluginPersistenceService.dropPluginRecords(this.builtinPluginRegistryService.listRetiredPluginIds());
    return this.builtinPluginRegistryService.listDefinitions().map((definition) => this.registerBuiltinDefinition(definition).pluginId);
  }

  bootstrapProjectPlugins(): string[] {
    if (!this.projectPluginRegistryService) {
      return [];
    }
    return this.projectPluginRegistryService
      .loadDefinitions()
      .map((definition) => this.registerProjectDefinition(definition).pluginId);
  }

  canReloadBuiltin(pluginId: string): boolean {
    return this.builtinPluginRegistryService?.hasDefinition(pluginId) ?? false;
  }

  canReloadLocal(pluginId: string): boolean {
    return Boolean(
      this.builtinPluginRegistryService?.hasDefinition(pluginId)
      || this.projectPluginRegistryService?.hasDefinition(pluginId),
    );
  }

  getLocalDefinition(pluginId: string): LocalPluginDefinitionRecord {
    if (this.builtinPluginRegistryService?.hasDefinition(pluginId)) {
      return {
        definition: this.builtinPluginRegistryService.getDefinition(pluginId),
        source: 'builtin',
      };
    }
    const projectDefinition = this.projectPluginRegistryService?.getDefinition(pluginId);
    if (projectDefinition) {
      return {
        definition: projectDefinition.definition,
        source: 'project',
        ...(projectDefinition.transportGovernance
          ? { transportGovernance: projectDefinition.transportGovernance }
          : {}),
      };
    }
    throw new Error(`Local plugin definition not found: ${pluginId}`);
  }

  reloadLocal(pluginId: string): string {
    if (this.builtinPluginRegistryService?.hasDefinition(pluginId)) {
      return this.registerBuiltinDefinition(this.builtinPluginRegistryService.getDefinition(pluginId)).pluginId;
    }
    if (!this.projectPluginRegistryService) {
      throw new Error('Project plugin registry is unavailable');
    }
    return this.registerProjectDefinition(this.projectPluginRegistryService.reloadDefinition(pluginId)).pluginId;
  }

  registerPlugin(input: RegisterPluginInput): RegisteredPluginRecord {
    const manifest = normalizePluginManifest(input.manifest, input.fallback);
    const existing = this.pluginPersistenceService.findPlugin(manifest.id);
    const governance = this.pluginGovernanceService.createState({ manifest, overrides: input.governance });
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
      remote: normalizeRemoteRecord(manifest, input.remote ?? existing?.remote ?? null),
    });
  }

  upsertRemotePlugin(input: UpsertRemotePluginInput): RegisteredPluginRecord {
    const normalizedInput = normalizeRemotePluginInput(input);
    return this.registerPlugin(createRemotePluginRegistration(normalizedInput, this.pluginPersistenceService.findPlugin(normalizedInput.pluginName) ?? null));
  }

  reloadBuiltin(pluginId: string): string {
    if (!this.builtinPluginRegistryService) { throw new Error('Builtin plugin registry is unavailable'); }
    return this.registerBuiltinDefinition(this.builtinPluginRegistryService.getDefinition(pluginId)).pluginId;
  }

  private registerBuiltinDefinition(definition: ReturnType<BuiltinPluginRegistryService['getDefinition']>): RegisteredPluginRecord {
    return this.registerPlugin({
      fallback: { id: definition.manifest.id, name: definition.manifest.name, runtime: 'local', version: definition.manifest.version },
      governance: definition.governance,
      manifest: definition.manifest,
    });
  }

  private registerProjectDefinition(
    definition: ProjectPluginDefinitionRecord,
  ): RegisteredPluginRecord {
    return this.registerPlugin({
      fallback: {
        id: definition.definition.manifest.id,
        name: definition.definition.manifest.name,
        runtime: 'local',
        version: definition.definition.manifest.version,
      },
      manifest: definition.definition.manifest,
    });
  }
}

function createRemotePluginRegistration(input: UpsertRemotePluginInput, existing: RegisteredPluginRecord | null): RegisterPluginInput {
  const name = input.displayName ?? input.pluginName;
  return {
    connected: false,
    fallback: { description: input.description, id: input.pluginName, name, remote: input.remote, runtime: 'remote', version: input.version },
    manifest: existing?.manifest.runtime === 'remote'
      ? existing.manifest
      : { id: input.pluginName, name, permissions: [], remote: input.remote, runtime: 'remote', tools: [], version: input.version ?? '0.0.0' },
    remote: { access: input.access, descriptor: input.remote, metadataCache: existing?.remote?.metadataCache ?? createEmptyRemoteMetadataCache() },
  };
}

function normalizeRemotePluginInput(input: UpsertRemotePluginInput): UpsertRemotePluginInput {
  const description = readText(input.description), displayName = readText(input.displayName), version = readText(input.version);
  return {
    access: { accessKey: readText(input.access.accessKey), serverUrl: readText(input.access.serverUrl) },
    ...(description ? { description } : {}),
    ...(displayName ? { displayName } : {}),
    pluginName: input.pluginName.trim(),
    remote: structuredClone(input.remote),
    ...(version ? { version } : {}),
  };
}

export function normalizePluginManifest(candidate: Partial<PluginManifest> | null | undefined, fallback: PluginManifestFallback): PluginManifest {
  const source = readRecord(candidate);
  const manifest: PluginManifest = {
    id: readText(source?.id) ?? fallback.id,
    name: readText(source?.name) ?? fallback.name ?? fallback.id,
    version: readText(source?.version) ?? fallback.version ?? '0.0.0',
    runtime: readLiteral(source?.runtime, PLUGIN_RUNTIME_KINDS) ?? fallback.runtime ?? 'remote',
    permissions: readArray<PluginPermission>(source?.permissions),
    tools: readArray<PluginCapability>(source?.tools),
  };
  assignManifestField(manifest, 'description', readText(source?.description) ?? fallback.description ?? null);
  assignManifestField(manifest, 'commands', readArray<PluginCommandDescriptor>(source?.commands));
  assignManifestField(manifest, 'crons', readArray<PluginCronDescriptor>(source?.crons));
  assignManifestField(manifest, 'hooks', readArray<PluginHookDescriptor>(source?.hooks));
  assignManifestField(manifest, 'routes', readArray<PluginRouteDescriptor>(source?.routes));
  assignManifestField(manifest, 'config', readConfig(source?.config));
  if (manifest.runtime === 'remote') {
    assignManifestField(manifest, 'remote', readRemoteDescriptor(source?.remote) ?? fallback.remote ?? null, true);
  }
  return manifest;
}

export function buildRemotePluginConnectionInfo(record: RegisteredPluginRecord): RemotePluginConnectionInfo {
  if (!record.remote) { throw new Error(`Plugin ${record.pluginId} is not a remote plugin`); }
  return { accessKey: record.remote.access.accessKey, pluginName: record.pluginId, remote: structuredClone(record.remote.descriptor), serverUrl: record.remote.access.serverUrl ?? '' };
}

function assignManifestField<K extends keyof PluginManifest>(manifest: PluginManifest, key: K, value: PluginManifest[K] | null, clone: boolean = false): void {
  if (value === null || (Array.isArray(value) && value.length === 0)) { return; }
  manifest[key] = (clone ? structuredClone(value) : value) as PluginManifest[K];
}

function readConfig(value: unknown): PluginConfigSchema | null {
  const node = readConfigNode(value);
  return node?.type === 'object' ? node : null;
}

function readRemoteDescriptor(value: unknown): PluginRemoteDescriptor | null {
  const record = readRecord(value), authMode = readLiteral(readRecord(record?.auth)?.mode, REMOTE_AUTH_MODES), capabilityProfile = readLiteral(record?.capabilityProfile, REMOTE_CAPABILITY_PROFILES), remoteEnvironment = readLiteral(record?.remoteEnvironment, REMOTE_ENVIRONMENTS);
  return authMode && capabilityProfile && remoteEnvironment ? { auth: { mode: authMode }, capabilityProfile, remoteEnvironment } : null;
}

function readConfigNode(value: unknown): PluginConfigNodeSchema | null {
  const record = readRecord(value), type = readLiteral(record?.type, CONFIG_NODE_TYPES);
  if (!record || !type) { return null; }
  if (type === 'object') {
    const items = readConfigItems(record.items);
    return Object.keys(items).length > 0 ? { ...readConfigShared(record), items, type } : null;
  }
  if (type === 'list') {
    const items = readConfigNode(record.items);
    return items ? { ...readConfigShared(record), items, type } : { ...readConfigShared(record), type };
  }
  return { ...readConfigShared(record), type };
}

function readConfigShared(record: ManifestRecord): Omit<PluginConfigNodeSchema, 'items' | 'type'> {
  return {
    ...readConfigBase(record),
    ...readConfigConditionState(record.condition),
    ...readConfigOptionsState(record.options),
  };
}

function readConfigBase(record: ManifestRecord): Record<string, JsonValue | PluginConfigRenderType> {
  const fields = Object.fromEntries([
    ...CONFIG_TEXT_FIELDS.map((key) => [key, readText(record[key])] as const),
    ...CONFIG_BOOLEAN_FIELDS.map((key) => [key, typeof record[key] === 'boolean' ? record[key] as boolean : null] as const),
    ['renderType', readLiteral(record.renderType, CONFIG_RENDER_TYPES)] as const,
    ['defaultValue', isJsonValue(record.defaultValue) ? structuredClone(record.defaultValue) : null] as const,
  ].filter(([, value]) => value !== null));
  return fields as Record<string, JsonValue | PluginConfigRenderType>;
}

function readConfigItems(value: unknown): Record<string, PluginConfigNodeSchema> {
  const record = readRecord(value);
  if (!record) { return {}; }
  return Object.fromEntries(Object.entries(record).flatMap(([key, item]) => {
    const node = readConfigNode(item);
    return node ? [[key, node]] : [];
  }));
}

function readConfigConditionState(value: unknown): Pick<PluginConfigNodeSchema, 'condition'> | Record<string, never> {
  const record = readRecord(value);
  if (!record) { return {}; }
  const condition = Object.fromEntries(Object.entries(record).filter((entry): entry is [string, PluginConfigConditionValue] => isConfigConditionValue(entry[1])));
  return Object.keys(condition).length > 0 ? { condition } : {};
}

function readConfigOptionsState(value: unknown): Pick<PluginConfigNodeSchema, 'options'> | Record<string, never> {
  const options = Array.isArray(value) ? value.flatMap((item) => {
    const record = readRecord(item), optionValue = readText(record?.value);
    if (!record || !optionValue) { return []; }
    const label = readText(record.label), description = readText(record.description);
    return [{ value: optionValue, ...(label ? { label } : {}), ...(description ? { description } : {}) } satisfies PluginConfigOptionSchema];
  }) : [];
  return options.length > 0 ? { options } : {};
}

function isConfigConditionValue(value: unknown): value is PluginConfigConditionValue {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || (Array.isArray(value) && value.every(isJsonValue))
    || (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item !== 'undefined' && isJsonValue(item)));
}

function normalizeRemoteRecord(manifest: PluginManifest, remote: RegisteredPluginRemoteRecord | null): RegisteredPluginRemoteRecord | null {
  const descriptor = manifest.runtime === 'remote' ? manifest.remote ?? remote?.descriptor : null;
  return descriptor ? { access: { accessKey: remote?.access.accessKey ?? null, serverUrl: remote?.access.serverUrl ?? null }, descriptor, metadataCache: remote?.metadataCache ?? createEmptyRemoteMetadataCache() } : null;
}

function createEmptyRemoteMetadataCache(): RegisteredPluginRemoteRecord['metadataCache'] {
  return { lastSyncedAt: null, manifestHash: null, status: 'empty' };
}

function readRecord(value: unknown): ManifestRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as ManifestRecord : null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readLiteral<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...value] as T[] : [];
}
