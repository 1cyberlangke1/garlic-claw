import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EventLogSettings,
  JsonObject,
  JsonValue,
  ListPluginEventOptions,
  PluginConfigNodeSchema,
  PluginConfigSnapshot,
  PluginEventLevel,
  PluginEventListResult,
  PluginEventRecord,
  PluginGovernanceInfo,
  PluginLlmPreference,
  PluginManifest,
  PluginRemoteAccessConfig,
  PluginRemoteDescriptor,
  PluginRemoteMetadataCacheInfo,
  PluginScopeSettings,
  PluginStatus,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RuntimeEventLogService, normalizeEventLogSettings } from '../../runtime/log/runtime-event-log.service';
import { createServerTestArtifactPath, resolveServerStatePath } from '../../runtime/server-workspace-paths';
import { PLUGIN_STATUS } from '../plugin.constants';
import { createPluginConfigSnapshot } from './plugin-read-model';

export interface RegisteredPluginRemoteRecord { access: PluginRemoteAccessConfig; descriptor: PluginRemoteDescriptor; metadataCache: PluginRemoteMetadataCacheInfo; }
export interface RegisteredPluginRecord {
  connected: boolean;
  configValues?: JsonObject;
  conversationScopes?: Record<string, boolean>;
  createdAt: string;
  defaultEnabled: boolean;
  eventLog: EventLogSettings;
  governance: PluginGovernanceInfo;
  lastSeenAt: string | null;
  llmPreference: PluginLlmPreference;
  manifest: PluginManifest;
  pluginId: string;
  remote?: RegisteredPluginRemoteRecord | null;
  status: PluginStatus;
  updatedAt: string;
}

interface PluginPersistenceFile { records: RegisteredPluginRecord[]; }
type UpsertPluginRecordInput = Omit<RegisteredPluginRecord, 'createdAt' | 'eventLog' | 'llmPreference' | 'status' | 'updatedAt'> & Partial<Pick<RegisteredPluginRecord, 'createdAt' | 'eventLog' | 'llmPreference' | 'status' | 'updatedAt'>>;
type PluginEventInput = { level: PluginEventLevel; message: string; metadata?: JsonObject; type: string };

@Injectable()
export class PluginPersistenceService {
  private readonly records = new Map<string, RegisteredPluginRecord>();
  private readonly storagePath = resolvePluginStatePath();

  constructor(@Optional() private readonly runtimeEventLogService: RuntimeEventLogService = new RuntimeEventLogService()) {
    for (const record of loadPersistedPluginRecords(this.storagePath)) { this.records.set(record.pluginId, cloneRegisteredPluginRecord(record)); }
  }

  findPlugin(pluginId: string): RegisteredPluginRecord | null { return clonePluginRecord(this.records.get(pluginId)); }
  getPluginOrThrow(pluginId: string): RegisteredPluginRecord { return cloneRegisteredPluginRecord(this.readPlugin(pluginId)); }
  getPluginConfig(pluginId: string): PluginConfigSnapshot { return createPluginConfigSnapshot(this.readPlugin(pluginId)); }
  getPluginLlmPreference(pluginId: string): PluginLlmPreference { return { ...this.readPlugin(pluginId).llmPreference }; }
  getPluginScope(pluginId: string): PluginScopeSettings { return toPluginScopeSettings(this.readPlugin(pluginId)); }
  getPluginEventLog(pluginId: string): EventLogSettings { return normalizeEventLogSettings(this.readPlugin(pluginId).eventLog); }
  listPluginEvents(pluginId: string, options: ListPluginEventOptions = {}): PluginEventListResult { this.readPlugin(pluginId); return this.runtimeEventLogService.listLogs('plugin', pluginId, options); }
  listPlugins(): RegisteredPluginRecord[] { return [...this.records.values()].map(cloneRegisteredPluginRecord); }

  recordPluginEvent(pluginId: string, input: PluginEventInput): PluginEventRecord {
    return this.runtimeEventLogService.appendLog('plugin', pluginId, this.readPlugin(pluginId).eventLog, input) ?? createDisabledPluginEventRecord(input);
  }
  recordDetachedPluginEvent(pluginId: string, eventLog: EventLogSettings, input: PluginEventInput): PluginEventRecord {
    return this.runtimeEventLogService.appendLog('plugin', pluginId, eventLog, input) ?? createDisabledPluginEventRecord(input);
  }

  setConnectionState(pluginId: string, connected: boolean): RegisteredPluginRecord {
    return this.updatePlugin(pluginId, (r, timestamp) => ({ ...r, connected, status: connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE, updatedAt: timestamp }));
  }

  deletePlugin(pluginId: string): RegisteredPluginRecord {
    const record = this.readPlugin(pluginId);
    if (record.connected) { throw new BadRequestException(`Plugin ${record.pluginId} is still connected`); }
    this.records.delete(pluginId);
    this.persistRecords();
    return cloneRegisteredPluginRecord(record);
  }

  dropPluginRecords(pluginIds: string[]): string[] {
    const droppedPluginIds = pluginIds.filter((pluginId) => this.records.delete(pluginId));
    if (droppedPluginIds.length > 0) {
      this.persistRecords();
    }
    return droppedPluginIds;
  }

  touchHeartbeat(pluginId: string, seenAt: string): RegisteredPluginRecord {
    return this.updatePlugin(pluginId, (record) => ({ ...record, connected: true, lastSeenAt: seenAt, status: PLUGIN_STATUS.ONLINE, updatedAt: seenAt }));
  }

  upsertPlugin(record: UpsertPluginRecordInput): RegisteredPluginRecord {
    const existing = this.records.get(record.pluginId), now = new Date().toISOString(), remote = normalizeRegisteredPluginRemote(record.manifest, record.remote ?? existing?.remote);
    return this.writeRecord({
      ...record,
      configValues: record.configValues ?? {},
      conversationScopes: record.conversationScopes ?? {},
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      eventLog: normalizeEventLogSettings(record.eventLog ?? existing?.eventLog),
      llmPreference: normalizePluginLlmPreference(record.llmPreference ?? existing?.llmPreference),
      manifest: normalizePersistedPluginManifest(record.manifest, remote?.descriptor ?? null),
      remote,
      status: record.status ?? (record.connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE),
      updatedAt: record.updatedAt ?? now,
    });
  }

  updatePluginConfig(pluginId: string, values: JsonObject): PluginConfigSnapshot {
    return createPluginConfigSnapshot(this.updatePlugin(pluginId, (record, timestamp) => {
      validatePluginConfig(record.manifest, values);
      return { ...record, configValues: { ...values }, updatedAt: timestamp };
    }));
  }

  updatePluginScope(pluginId: string, patch: Partial<PluginScopeSettings>): PluginScopeSettings {
    return toPluginScopeSettings(this.updatePlugin(pluginId, (record, timestamp) => ({
      ...record,
      defaultEnabled: typeof patch.defaultEnabled === 'boolean' ? patch.defaultEnabled : record.defaultEnabled,
      conversationScopes: patch.conversations ? { ...patch.conversations } : { ...(record.conversationScopes ?? {}) },
      updatedAt: timestamp,
    })));
  }

  updatePluginLlmPreference(pluginId: string, preference: PluginLlmPreference): PluginLlmPreference {
    const nextPreference = normalizePluginLlmPreference(preference);
    this.updatePlugin(pluginId, (record, timestamp) => ({ ...record, llmPreference: nextPreference, updatedAt: timestamp }));
    return { ...nextPreference };
  }

  updatePluginEventLog(pluginId: string, settings: EventLogSettings): EventLogSettings {
    const nextSettings = normalizeEventLogSettings(settings);
    this.updatePlugin(pluginId, (record, timestamp) => ({ ...record, eventLog: nextSettings, updatedAt: timestamp }));
    return { ...nextSettings };
  }

  private readPlugin(pluginId: string): RegisteredPluginRecord {
    const record = this.records.get(pluginId);
    if (!record) { throw new NotFoundException(`Plugin not found: ${pluginId}`); }
    return record;
  }

  private updatePlugin(pluginId: string, update: (record: RegisteredPluginRecord, timestamp: string) => RegisteredPluginRecord): RegisteredPluginRecord {
    return this.writeRecord(update(this.readPlugin(pluginId), new Date().toISOString()));
  }

  private writeRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
    const nextRecord = cloneRegisteredPluginRecord(record);
    this.records.set(nextRecord.pluginId, nextRecord);
    this.persistRecords();
    return cloneRegisteredPluginRecord(nextRecord);
  }

  private persistRecords(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({ records: [...this.records.values()].map(cloneRegisteredPluginRecord) } satisfies PluginPersistenceFile, null, 2), 'utf-8');
  }
}

function clonePluginRecord(record: RegisteredPluginRecord | undefined): RegisteredPluginRecord | null {
  return record ? cloneRegisteredPluginRecord(record) : null;
}

function createDisabledPluginEventRecord(input: PluginEventInput): PluginEventRecord {
  return {
    createdAt: new Date().toISOString(),
    id: `plugin-event-disabled-${Date.now()}`,
    level: input.level,
    message: input.message,
    metadata: input.metadata ? { ...input.metadata } : null,
    type: input.type,
  };
}

export function cloneRegisteredPluginRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
  return structuredClone(record);
}

function normalizeRegisteredPluginRemote(manifest: PluginManifest, remote: RegisteredPluginRemoteRecord | null | undefined): RegisteredPluginRemoteRecord | null {
  if (manifest.runtime !== 'remote') { return null; }
  const descriptor = remote?.descriptor ?? manifest.remote ?? { auth: { mode: 'required' }, capabilityProfile: 'query', remoteEnvironment: 'api' };
  return {
    access: { accessKey: remote?.access.accessKey ?? null, serverUrl: remote?.access.serverUrl ?? null },
    descriptor,
    metadataCache: {
      lastSyncedAt: remote?.metadataCache.lastSyncedAt ?? null,
      manifestHash: remote?.metadataCache.manifestHash ?? null,
      status: remote?.metadataCache.status ?? 'empty',
    },
  };
}

function normalizePersistedPluginManifest(manifest: PluginManifest, descriptor: PluginRemoteDescriptor | null): PluginManifest {
  return manifest.runtime !== 'remote' ? structuredClone(manifest) : { ...structuredClone(manifest), remote: descriptor ?? manifest.remote };
}

function loadPersistedPluginRecords(storagePath: string): RegisteredPluginRecord[] {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) { return []; }
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as Partial<PluginPersistenceFile>;
    return Array.isArray(parsed.records) ? parsed.records.map((record) => ({ ...cloneRegisteredPluginRecord(record), eventLog: normalizeEventLogSettings(record.eventLog) })) : [];
  } catch {
    return [];
  }
}

function resolvePluginStatePath(): string {
  return process.env.GARLIC_CLAW_PLUGIN_STATE_PATH
    ?? (process.env.JEST_WORKER_ID
      ? createServerTestArtifactPath({ extension: '.json', prefix: 'plugins.server.test', subdirectory: 'server' })
      : resolveServerStatePath('plugins.server.json'));
}

function toPluginScopeSettings(record: RegisteredPluginRecord): PluginScopeSettings {
  return { defaultEnabled: record.defaultEnabled, conversations: { ...(record.conversationScopes ?? {}) } };
}

export function normalizePluginLlmPreference(preference?: PluginLlmPreference | null): PluginLlmPreference {
  if (!preference || preference.mode === 'inherit') { return { mode: 'inherit', modelId: null, providerId: null }; }
  const providerId = preference.providerId?.trim(), modelId = preference.modelId?.trim();
  if (!providerId || !modelId) { throw new BadRequestException('插件模型覆盖必须同时指定 providerId 和 modelId'); }
  return { mode: 'override', modelId, providerId };
}

export function validatePluginConfig(manifest: PluginManifest, values: JsonObject): void {
  if (!manifest.config) { throw new BadRequestException(`Plugin ${manifest.id} 未声明配置 schema`); }
  validateConfigNode(manifest.config, values, []);
}

function validateConfigNode(schema: PluginConfigNodeSchema, value: JsonValue | undefined, scope: string[]): void {
  if (value === undefined) { return; }
  const label = scope.length > 0 ? scope.join('.') : 'config', allowedOptions = new Set((schema.options ?? []).map((option) => option.value));
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new BadRequestException(`配置字段 ${label} 必须是对象`); }
    for (const key of Object.keys(value as JsonObject)) {
      const childSchema = schema.items[key], childScope = [...scope, key];
      if (!childSchema) { throw new BadRequestException(`未知配置字段: ${childScope.join('.')}`); }
      validateConfigNode(childSchema, (value as JsonObject)[key], childScope);
    }
    return;
  }
  if (schema.type === 'list') {
    if (!Array.isArray(value)) { throw new BadRequestException(`配置字段 ${label} 必须是数组`); }
    value.forEach((item, index) => {
      const itemScope = [...scope, String(index)];
      assertOptionValue(allowedOptions, item, itemScope);
      if (schema.items) { validateConfigNode(schema.items, item, itemScope); }
    });
    return;
  }
  if (schema.type === 'string' || schema.type === 'text') {
    if (typeof value !== 'string') { throw new BadRequestException(`配置字段 ${label} 必须是字符串`); }
    assertOptionValue(allowedOptions, value, scope);
    return;
  }
  if (schema.type === 'int' || schema.type === 'float') {
    if (typeof value !== 'number' || Number.isNaN(value)) { throw new BadRequestException(`配置字段 ${label} 必须是数字`); }
    return;
  }
  if (typeof value !== 'boolean') { throw new BadRequestException(`配置字段 ${label} 必须是布尔值`); }
}

function assertOptionValue(allowedOptions: Set<string>, value: JsonValue, scope: string[]): void {
  if (allowedOptions.size > 0 && (typeof value !== 'string' || !allowedOptions.has(value))) {
    throw new BadRequestException(`配置字段 ${scope.length > 0 ? scope.join('.') : 'config'} 必须命中声明的 options`);
  }
}
