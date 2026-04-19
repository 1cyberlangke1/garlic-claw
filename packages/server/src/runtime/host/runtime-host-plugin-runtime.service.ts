import type { JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { Injectable, Optional } from '@nestjs/common';
import { PluginPersistenceService } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeEventLogService } from '../log/runtime-event-log.service';
import {
  SCOPED_STORE_PREFIX,
  asJsonValue,
  cloneJsonValue,
  readJsonObject,
  readJsonValue,
  readOptionalBoolean,
  readOptionalString,
  readPositiveInteger,
  readRequiredJsonValue,
  readRequiredString,
  readScope,
  readScopedKey,
  requireContextField,
} from './runtime-host-values';

interface RuntimeCronJobRecord {
  createdAt: string;
  cron: string;
  data?: JsonValue;
  description?: string;
  enabled: boolean;
  id: string;
  lastError: string | null;
  lastErrorAt: string | null;
  lastRunAt: string | null;
  name: string;
  pluginId: string;
  source: 'host';
  updatedAt: string;
}

@Injectable()
export class RuntimeHostPluginRuntimeService {
  private readonly cronJobs = new Map<string, RuntimeCronJobRecord[]>();
  private cronSequence = 0;
  private readonly stateStore = new Map<string, Map<string, JsonValue>>();
  private readonly storageStore = new Map<string, Map<string, JsonValue>>();
  private readonly runtimeEventLogService: RuntimeEventLogService;

  constructor(
    @Optional() private readonly pluginPersistenceService?: PluginPersistenceService,
    @Optional() runtimeEventLogService?: RuntimeEventLogService,
  ) {
    this.runtimeEventLogService = runtimeEventLogService ?? new RuntimeEventLogService();
  }

  deleteCronJob(pluginId: string, params: JsonObject): JsonValue {
    const jobId = readRequiredString(params, 'jobId');
    const jobs = this.cronJobs.get(pluginId) ?? [];
    const nextJobs = jobs.filter((job) => job.id !== jobId);
    this.cronJobs.set(pluginId, nextJobs);
    return nextJobs.length !== jobs.length;
  }

  deletePluginStorage(pluginId: string, key: string): boolean {
    return this.getPluginStore('storage', pluginId).delete(key);
  }

  deleteStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    return this.getPluginStore(surface, pluginId).delete(this.buildScopedKey(context, params));
  }

  getStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const store = this.getPluginStore(surface, pluginId);
    const key = this.buildScopedKey(context, params);
    return store.has(key) ? cloneJsonValue(store.get(key) ?? null) : null;
  }

  listCronJobs(pluginId: string): JsonValue {
    return (this.cronJobs.get(pluginId) ?? []).slice().sort((left, right) => left.name.localeCompare(right.name)).map((job) => asJsonValue(job));
  }

  listPluginLogs(pluginId: string, params: JsonObject): JsonValue {
    return asJsonValue(this.runtimeEventLogService.listLogs('plugin', pluginId, {
      ...(readPositiveInteger(params, 'limit') ? { limit: readPositiveInteger(params, 'limit') ?? undefined } : {}),
      ...(readOptionalString(params, 'level') ? { level: readOptionalString(params, 'level') as 'info' | 'warn' | 'error' } : {}),
      ...(readOptionalString(params, 'type') ? { type: readOptionalString(params, 'type') ?? undefined } : {}),
      ...(readOptionalString(params, 'keyword') ? { keyword: readOptionalString(params, 'keyword') ?? undefined } : {}),
      ...(readOptionalString(params, 'cursor') ? { cursor: readOptionalString(params, 'cursor') ?? undefined } : {}),
    }));
  }

  listPluginStorage(pluginId: string, prefix?: string): Array<{ key: string; value: JsonValue }> {
    const requestedPrefix = prefix?.trim() ?? '';
    return [...this.getPluginStore('storage', pluginId).entries()]
      .filter(([key]) => requestedPrefix ? key.startsWith(requestedPrefix) : !key.startsWith(SCOPED_STORE_PREFIX))
      .map(([key, value]) => ({ key, value: cloneJsonValue(value) }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  listStoreValues(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const scope = readScope(params);
    const prefix = this.buildScopePrefix(scope, context);
    const requestedPrefix = readOptionalString(params, 'prefix')?.trim() ?? '';
    const filterPrefix = `${prefix}${requestedPrefix}`;

    return [...this.getPluginStore(surface, pluginId).entries()]
      .filter(([key]) => scope === 'plugin' ? (requestedPrefix ? key.startsWith(requestedPrefix) : !key.startsWith(SCOPED_STORE_PREFIX)) : key.startsWith(filterPrefix))
      .map(([key, value]) => ({ key: prefix ? key.slice(prefix.length) : key, value: cloneJsonValue(value) }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  registerCronJob(pluginId: string, params: JsonObject): JsonValue {
    const now = new Date().toISOString();
    const record: RuntimeCronJobRecord = {
      createdAt: now,
      cron: readRequiredString(params, 'cron'),
      enabled: readOptionalBoolean(params, 'enabled') ?? true,
      id: `cron-job-${++this.cronSequence}`,
      lastError: null,
      lastErrorAt: null,
      lastRunAt: null,
      name: readRequiredString(params, 'name'),
      pluginId,
      source: 'host',
      updatedAt: now,
    };
    const description = readOptionalString(params, 'description');
    if (description) {record.description = description;}
    const data = readJsonValue(params.data);
    if (data !== null) {record.data = data;}

    const jobs = this.cronJobs.get(pluginId) ?? [];
    jobs.push(record);
    this.cronJobs.set(pluginId, jobs);
    return asJsonValue(record);
  }

  setPluginStorage(pluginId: string, key: string, value: JsonValue): JsonValue {
    const store = this.getPluginStore('storage', pluginId);
    store.set(key, cloneJsonValue(value));
    return cloneJsonValue(value);
  }

  setStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const value = readRequiredJsonValue(params, 'value');
    this.getPluginStore(surface, pluginId).set(this.buildScopedKey(context, params), cloneJsonValue(value));
    return cloneJsonValue(value);
  }

  writePluginLog(pluginId: string, params: JsonObject): JsonValue {
    this.runtimeEventLogService.appendLog(
      'plugin',
      pluginId,
      this.pluginPersistenceService?.findPlugin(pluginId)?.eventLog,
      {
        level: (readOptionalString(params, 'level') ?? 'info') as 'error' | 'info' | 'warn',
        message: readRequiredString(params, 'message'),
        ...(readJsonObject(params.metadata) ? { metadata: readJsonObject(params.metadata) ?? undefined } : {}),
        type: readOptionalString(params, 'type') ?? 'plugin:log',
      },
    );
    return true;
  }

  private buildScopePrefix(scope: 'conversation' | 'plugin' | 'user', context: PluginCallContext): string {
    switch (scope) {
      case 'plugin':
        return '';
      case 'conversation':
        return `${SCOPED_STORE_PREFIX}conversation:${requireContextField(context, 'conversationId')}:`;
      case 'user':
        return `${SCOPED_STORE_PREFIX}user:${requireContextField(context, 'userId')}:`;
    }
  }

  private buildScopedKey(context: PluginCallContext, params: JsonObject): string {
    return `${this.buildScopePrefix(readScope(params), context)}${readScopedKey(params)}`;
  }

  private getPluginStore(surface: 'state' | 'storage', pluginId: string): Map<string, JsonValue> {
    const surfaceStore = surface === 'state' ? this.stateStore : this.storageStore;
    const existing = surfaceStore.get(pluginId);
    if (existing) {return existing;}
    const created = new Map<string, JsonValue>();
    surfaceStore.set(pluginId, created);
    return created;
  }
}
