import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  EventLogSettings,
  JsonObject,
  JsonValue,
  ListPluginEventOptions,
  PluginConfigListSchema,
  PluginConfigNodeSchema,
  PluginConfigObjectSchema,
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
    for (const record of loadPersistedPluginRecords(this.storagePath)) {this.records.set(record.pluginId, cloneRegisteredPluginRecord(record));}
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
    const record = this.readPlugin(pluginId);
    return this.runtimeEventLogService.appendLog('plugin', pluginId, record.eventLog, input) ?? createDisabledPluginEventRecord(input);
  }

  setConnectionState(pluginId: string, connected: boolean): RegisteredPluginRecord {
    return this.updatePlugin(pluginId, (record, timestamp) => ({ ...record, connected, status: connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE, updatedAt: timestamp }));
  }

  deletePlugin(pluginId: string): RegisteredPluginRecord {
    const record = this.readPlugin(pluginId);
    if (record.connected) {throw new BadRequestException(`Plugin ${record.pluginId} is still connected`);}
    this.records.delete(pluginId);
    this.persistRecords();
    return cloneRegisteredPluginRecord(record);
  }

  touchHeartbeat(pluginId: string, seenAt: string): RegisteredPluginRecord {
    return this.updatePlugin(pluginId, (record) => ({ ...record, connected: true, lastSeenAt: seenAt, status: PLUGIN_STATUS.ONLINE, updatedAt: seenAt }));
  }

  upsertPlugin(record: UpsertPluginRecordInput): RegisteredPluginRecord {
    const now = new Date().toISOString();
    const existing = this.records.get(record.pluginId);
    const remote = normalizeRegisteredPluginRemote(record.manifest, record.remote ?? existing?.remote);
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
    const normalizedPreference = normalizePluginLlmPreference(preference);
    this.updatePlugin(pluginId, (record, timestamp) => ({ ...record, llmPreference: normalizedPreference, updatedAt: timestamp }));
    return { ...normalizedPreference };
  }

  updatePluginEventLog(pluginId: string, settings: EventLogSettings): EventLogSettings {
    const normalizedSettings = normalizeEventLogSettings(settings);
    this.updatePlugin(pluginId, (record, timestamp) => ({ ...record, eventLog: normalizedSettings, updatedAt: timestamp }));
    return { ...normalizedSettings };
  }

  private readPlugin(pluginId: string): RegisteredPluginRecord {
    const record = this.records.get(pluginId);
    if (!record) {throw new NotFoundException(`Plugin not found: ${pluginId}`);}
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
  if (manifest.runtime !== 'remote') {return null;}
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
    if (!fs.existsSync(storagePath)) {return [];}
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as Partial<PluginPersistenceFile>;
    return Array.isArray(parsed.records) ? parsed.records.map((record) => ({ ...cloneRegisteredPluginRecord(record), eventLog: normalizeEventLogSettings(record.eventLog) })) : [];
  } catch {
    return [];
  }
}

function resolvePluginStatePath(): string {
  if (process.env.GARLIC_CLAW_PLUGIN_STATE_PATH) {return process.env.GARLIC_CLAW_PLUGIN_STATE_PATH;}
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `plugins.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);}
  return path.join(process.cwd(), 'tmp', 'plugins.server.json');
}

function toPluginScopeSettings(record: RegisteredPluginRecord): PluginScopeSettings {
  return { defaultEnabled: record.defaultEnabled, conversations: { ...(record.conversationScopes ?? {}) } };
}

export function normalizePluginLlmPreference(preference?: PluginLlmPreference | null): PluginLlmPreference {
  if (!preference || preference.mode === 'inherit') {return { mode: 'inherit', modelId: null, providerId: null };}
  const providerId = preference.providerId?.trim();
  const modelId = preference.modelId?.trim();
  if (!providerId || !modelId) {throw new BadRequestException('插件模型覆盖必须同时指定 providerId 和 modelId');}
  return { mode: 'override', modelId, providerId };
}

export function validatePluginConfig(manifest: PluginManifest, values: JsonObject): void {
  const schema = manifest.config;
  if (!schema) {throw new BadRequestException(`Plugin ${manifest.id} 未声明配置 schema`);}
  validateConfigNode(schema, values, []);
}

function validateConfigNode(schema: PluginConfigNodeSchema, value: JsonValue | undefined, scope: string[]): void {
  if (value === undefined) {return;}
  const label = scope.length > 0 ? scope.join('.') : 'config';
  const allowedOptionValues = new Set((schema.options ?? []).map((option) => option.value));
  if (schema.type === 'object') {return validateObjectConfigNode(schema, value, scope);}
  if (schema.type === 'list') {return validateListConfigNode(schema, value, scope, allowedOptionValues);}
  if (schema.type === 'string' || schema.type === 'text') {
    if (typeof value !== 'string') {throw new BadRequestException(`配置字段 ${label} 必须是字符串`);}
    return validateOptionValue(allowedOptionValues, value, scope);
  }
  if (schema.type === 'int' || schema.type === 'float') {
    if (typeof value !== 'number' || Number.isNaN(value)) {throw new BadRequestException(`配置字段 ${label} 必须是数字`);}
    return;
  }
  if (schema.type === 'bool' && typeof value !== 'boolean') {throw new BadRequestException(`配置字段 ${label} 必须是布尔值`);}
}

function validateObjectConfigNode(schema: PluginConfigObjectSchema, value: JsonValue, scope: string[]): void {
  const label = scope.length > 0 ? scope.join('.') : 'config';
  if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new BadRequestException(`配置字段 ${label} 必须是对象`);}
  const record = value as JsonObject;
  for (const key of Object.keys(record)) {
    const childSchema = schema.items[key];
    if (!childSchema) {throw new BadRequestException(`未知配置字段: ${[...scope, key].join('.')}`);}
    validateConfigNode(childSchema, record[key], [...scope, key]);
  }
}

function validateListConfigNode(schema: PluginConfigListSchema, value: JsonValue, scope: string[], allowedOptionValues: Set<string>): void {
  const label = scope.length > 0 ? scope.join('.') : 'config';
  if (!Array.isArray(value)) {throw new BadRequestException(`配置字段 ${label} 必须是数组`);}
  value.forEach((item, index) => {
    const nextScope = [...scope, String(index)];
    validateOptionValue(allowedOptionValues, item, nextScope);
    if (schema.items) {validateConfigNode(schema.items, item, nextScope);}
  });
}

function validateOptionValue(allowedOptionValues: Set<string>, value: JsonValue, scope: string[]): void {
  if (allowedOptionValues.size === 0) {return;}
  if (typeof value !== 'string' || !allowedOptionValues.has(value)) {
    throw new BadRequestException(`配置字段 ${scope.length > 0 ? scope.join('.') : 'config'} 必须命中声明的 options`);
  }
}
