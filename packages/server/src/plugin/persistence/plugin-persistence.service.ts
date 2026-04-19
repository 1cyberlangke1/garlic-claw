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
import { PLUGIN_STATUS } from '../plugin.constants';
import { createPluginConfigSnapshot } from './plugin-read-model';
import { RuntimeEventLogService, normalizeEventLogSettings } from '../../runtime/log/runtime-event-log.service';

export interface RegisteredPluginRemoteRecord {
  access: PluginRemoteAccessConfig;
  descriptor: PluginRemoteDescriptor;
  metadataCache: PluginRemoteMetadataCacheInfo;
}

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

interface PluginPersistenceFile {
  records: RegisteredPluginRecord[];
}

type UpsertPluginRecordInput =
  Omit<RegisteredPluginRecord, 'createdAt' | 'eventLog' | 'llmPreference' | 'status' | 'updatedAt'>
  & Partial<Pick<RegisteredPluginRecord, 'createdAt' | 'eventLog' | 'llmPreference' | 'status' | 'updatedAt'>>;
type PluginEventInput = { level: PluginEventLevel; message: string; metadata?: JsonObject; type: string };

@Injectable()
export class PluginPersistenceService {
  private readonly records = new Map<string, RegisteredPluginRecord>();
  private readonly storagePath = resolvePluginStatePath();
  private readonly runtimeEventLogService: RuntimeEventLogService;

  constructor(@Optional() runtimeEventLogService?: RuntimeEventLogService) {
    this.runtimeEventLogService = runtimeEventLogService ?? new RuntimeEventLogService();
    for (const record of loadPersistedPluginRecords(this.storagePath)) {
      this.records.set(record.pluginId, cloneRegisteredPluginRecord(record));
    }
  }

  findPlugin(pluginId: string): RegisteredPluginRecord | null { const record = this.records.get(pluginId); return record ? cloneRegisteredPluginRecord(record) : null; }

  getPluginOrThrow(pluginId: string): RegisteredPluginRecord {
    return cloneRegisteredPluginRecord(this.readMutableRecord(pluginId));
  }

  getPluginConfig(pluginId: string): PluginConfigSnapshot { return createPluginConfigSnapshot(this.readMutableRecord(pluginId)); }
  getPluginLlmPreference(pluginId: string): PluginLlmPreference { return { ...this.readMutableRecord(pluginId).llmPreference }; }
  getPluginScope(pluginId: string): PluginScopeSettings { return toPluginScopeSettings(this.readMutableRecord(pluginId)); }
  getPluginEventLog(pluginId: string): EventLogSettings { return normalizeEventLogSettings(this.readMutableRecord(pluginId).eventLog); }

  listPluginEvents(pluginId: string, options: ListPluginEventOptions = {}): PluginEventListResult {
    this.readMutableRecord(pluginId);
    return this.runtimeEventLogService.listLogs('plugin', pluginId, options);
  }

  listPlugins(): RegisteredPluginRecord[] { return [...this.records.values()].map(cloneRegisteredPluginRecord); }

  recordPluginEvent(pluginId: string, input: PluginEventInput): PluginEventRecord {
    const record = this.readMutableRecord(pluginId);
    return this.runtimeEventLogService.appendLog('plugin', pluginId, record.eventLog, input)
      ?? {
        createdAt: new Date().toISOString(),
        id: `plugin-event-disabled-${Date.now()}`,
        level: input.level,
        message: input.message,
        metadata: input.metadata ? { ...input.metadata } : null,
        type: input.type,
      };
  }

  setConnectionState(pluginId: string, connected: boolean): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    return this.writeRecord({
      ...current,
      connected,
      status: connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE,
      updatedAt: new Date().toISOString(),
    });
  }

  deletePlugin(pluginId: string): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    if (current.connected) {
      throw new BadRequestException(`Plugin ${current.pluginId} is still connected`);
    }
    this.records.delete(pluginId);
    this.persistRecords();
    return cloneRegisteredPluginRecord(current);
  }

  touchHeartbeat(pluginId: string, seenAt: string): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    return this.writeRecord({
      ...current,
      connected: true,
      lastSeenAt: seenAt,
      status: PLUGIN_STATUS.ONLINE,
      updatedAt: seenAt,
    });
  }

  upsertPlugin(record: UpsertPluginRecordInput): RegisteredPluginRecord {
    const now = new Date().toISOString();
    const existing = this.records.get(record.pluginId);
    const remote = normalizeRegisteredPluginRemote(record.manifest, record.remote ?? existing?.remote ?? null);
    const manifest = normalizePersistedPluginManifest(record.manifest, remote?.descriptor ?? null);
    return this.writeRecord({
      ...record,
      configValues: record.configValues ?? {},
      conversationScopes: record.conversationScopes ?? {},
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      eventLog: normalizeEventLogSettings(record.eventLog ?? existing?.eventLog),
      status: record.status ?? (record.connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE),
      llmPreference: normalizePluginLlmPreference(record.llmPreference ?? existing?.llmPreference),
      manifest,
      remote,
      updatedAt: record.updatedAt ?? now,
    });
  }

  updatePluginConfig(pluginId: string, values: JsonObject): PluginConfigSnapshot {
    const current = this.readMutableRecord(pluginId);
    validatePluginConfig(current.manifest, values);
    return createPluginConfigSnapshot(this.writeRecord({
      ...current,
      configValues: { ...values },
      updatedAt: new Date().toISOString(),
    }));
  }

  updatePluginScope(
    pluginId: string,
    patch: Partial<PluginScopeSettings>,
  ): PluginScopeSettings {
    const current = this.readMutableRecord(pluginId);
    return toPluginScopeSettings(this.writeRecord({
      ...current,
      defaultEnabled: typeof patch.defaultEnabled === 'boolean'
        ? patch.defaultEnabled
        : current.defaultEnabled,
      conversationScopes: patch.conversations
        ? { ...patch.conversations }
        : { ...(current.conversationScopes ?? {}) },
      updatedAt: new Date().toISOString(),
    }));
  }

  updatePluginLlmPreference(pluginId: string, preference: PluginLlmPreference): PluginLlmPreference {
    const current = this.readMutableRecord(pluginId);
    const normalizedPreference = normalizePluginLlmPreference(preference);
    this.writeRecord({
      ...current,
      llmPreference: normalizedPreference,
      updatedAt: new Date().toISOString(),
    });
    return { ...normalizedPreference };
  }

  updatePluginEventLog(pluginId: string, settings: EventLogSettings): EventLogSettings {
    const current = this.readMutableRecord(pluginId);
    const normalizedSettings = normalizeEventLogSettings(settings);
    this.writeRecord({
      ...current,
      eventLog: normalizedSettings,
      updatedAt: new Date().toISOString(),
    });
    return { ...normalizedSettings };
  }

  private readMutableRecord(pluginId: string): RegisteredPluginRecord { const record = this.records.get(pluginId); if (!record) {throw new NotFoundException(`Plugin not found: ${pluginId}`);} return record; }

  private writeRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
    const nextRecord = cloneRegisteredPluginRecord(record);
    this.records.set(record.pluginId, nextRecord);
    this.persistRecords();
    return cloneRegisteredPluginRecord(nextRecord);
  }

  private persistRecords(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({
      records: [...this.records.values()].map((record) => cloneRegisteredPluginRecord(record)),
    } satisfies PluginPersistenceFile, null, 2), 'utf-8');
  }
}

export function cloneRegisteredPluginRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
  return structuredClone(record);
}

function normalizeRegisteredPluginRemote(
  manifest: PluginManifest,
  remote: RegisteredPluginRemoteRecord | null | undefined,
): RegisteredPluginRemoteRecord | null {
  if (manifest.runtime !== 'remote') {
    return null;
  }
  const descriptor = remote?.descriptor ?? manifest.remote ?? {
    auth: { mode: 'required' },
    capabilityProfile: 'query',
    remoteEnvironment: 'api',
  };
  return {
    access: {
      accessKey: remote?.access.accessKey ?? null,
      serverUrl: remote?.access.serverUrl ?? null,
    },
    descriptor,
    metadataCache: {
      lastSyncedAt: remote?.metadataCache.lastSyncedAt ?? null,
      manifestHash: remote?.metadataCache.manifestHash ?? null,
      status: remote?.metadataCache.status ?? 'empty',
    },
  };
}

function normalizePersistedPluginManifest(
  manifest: PluginManifest,
  descriptor: PluginRemoteDescriptor | null,
): PluginManifest {
  if (manifest.runtime !== 'remote') {
    return structuredClone(manifest);
  }
  return {
    ...structuredClone(manifest),
    remote: descriptor ?? manifest.remote,
  };
}

function loadPersistedPluginRecords(storagePath: string): RegisteredPluginRecord[] {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) {
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as Partial<PluginPersistenceFile>;
    return Array.isArray(parsed.records)
      ? parsed.records.map((record) => ({
          ...cloneRegisteredPluginRecord(record),
          eventLog: normalizeEventLogSettings(record.eventLog),
        }))
      : [];
  } catch {
    return [];
  }
}

function resolvePluginStatePath(): string {
  if (process.env.GARLIC_CLAW_PLUGIN_STATE_PATH) {
    return process.env.GARLIC_CLAW_PLUGIN_STATE_PATH;
  }
  if (process.env.JEST_WORKER_ID) {
    return path.join(process.cwd(), 'tmp', `plugins.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  }
  return path.join(process.cwd(), 'tmp', 'plugins.server.json');
}

function toPluginScopeSettings(record: RegisteredPluginRecord): PluginScopeSettings {
  return { defaultEnabled: record.defaultEnabled, conversations: { ...(record.conversationScopes ?? {}) } };
}

export function normalizePluginLlmPreference(preference?: PluginLlmPreference | null): PluginLlmPreference {
  if (!preference || preference.mode === 'inherit') {
    return {
      mode: 'inherit',
      modelId: null,
      providerId: null,
    };
  }
  const providerId = preference.providerId?.trim();
  const modelId = preference.modelId?.trim();
  if (!providerId || !modelId) {
    throw new BadRequestException('插件模型覆盖必须同时指定 providerId 和 modelId');
  }
  return {
    mode: 'override',
    modelId,
    providerId,
  };
}

export function validatePluginConfig(manifest: PluginManifest, values: JsonObject): void {
  const schema = manifest.config;
  if (!schema) {throw new BadRequestException(`Plugin ${manifest.id} 未声明配置 schema`);}
  validateConfigNode(schema, values, []);
}

function validateConfigNode(
  schema: PluginConfigNodeSchema,
  value: JsonValue | undefined,
  path: string[],
): void {
  const label = path.length > 0 ? path.join('.') : 'config';
  const allowedOptionValues = new Set((schema.options ?? []).map((option) => option.value));

  if (typeof value === 'undefined') {
    return;
  }

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是对象`);
    }
    const record = value as JsonObject;
    for (const key of Object.keys(record)) {
      const childSchema = schema.items[key];
      if (!childSchema) {
        throw new BadRequestException(`未知配置字段: ${[...path, key].join('.')}`);
      }
      validateConfigNode(childSchema, record[key], [...path, key]);
    }
    return;
  }

  if (schema.type === 'list') {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是数组`);
    }
    if (allowedOptionValues.size > 0) {
      value.forEach((item, index) => validateOptionValue(allowedOptionValues, item, [...path, String(index)]));
    }
    const itemSchema = schema.items;
    if (!itemSchema) {
      return;
    }
    value.forEach((item, index) => validateConfigNode(itemSchema, item, [...path, String(index)]));
    return;
  }

  if (schema.type === 'string' || schema.type === 'text') {
    if (typeof value !== 'string') {
      throw new BadRequestException(`配置字段 ${label} 必须是字符串`);
    }
    validateOptionValue(allowedOptionValues, value, path);
    return;
  }

  if (schema.type === 'int' || schema.type === 'float') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是数字`);
    }
    return;
  }

  if (schema.type === 'bool' && typeof value !== 'boolean') {
    throw new BadRequestException(`配置字段 ${label} 必须是布尔值`);
  }
}

function validateOptionValue(
  allowedOptionValues: Set<string>,
  value: JsonValue,
  path: string[],
): void {
  if (allowedOptionValues.size === 0) {
    return;
  }
  const label = path.length > 0 ? path.join('.') : 'config';
  if (typeof value !== 'string' || !allowedOptionValues.has(value)) {
    throw new BadRequestException(`配置字段 ${label} 必须命中声明的 options`);
  }
}
