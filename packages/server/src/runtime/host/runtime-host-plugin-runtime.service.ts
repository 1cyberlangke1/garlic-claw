import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  JsonObject,
  JsonValue,
  PluginCallContext,
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginCronTickPayload,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { PluginPersistenceService } from '../../plugin/persistence/plugin-persistence.service';
import { createServerTestArtifactPath, resolveServerStatePath } from '../server-workspace-paths';
import { RuntimeEventLogService } from '../log/runtime-event-log.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
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

interface RuntimeCronJobRecord extends PluginCronJobSummary {}

interface RuntimePluginRuntimePluginStorePayload {
  crons?: RuntimeCronJobRecord[];
  state?: Record<string, JsonValue>;
  storage?: Record<string, JsonValue>;
}

interface RuntimePluginRuntimeStoragePayload {
  cronSequence?: number;
  plugins?: Record<string, RuntimePluginRuntimePluginStorePayload>;
}

interface RuntimePluginRuntimeSnapshot {
  cronJobs: Map<string, RuntimeCronJobRecord[]>;
  cronSequence: number;
  migrated: boolean;
  stateStore: Map<string, Map<string, JsonValue>>;
  storageStore: Map<string, Map<string, JsonValue>>;
}

@Injectable()
export class RuntimeHostPluginRuntimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly cronJobs = new Map<string, RuntimeCronJobRecord[]>();
  private readonly cronTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cronSequence = 0;
  private readonly stateStore = new Map<string, Map<string, JsonValue>>();
  private readonly storageStore = new Map<string, Map<string, JsonValue>>();
  private readonly storagePath = resolvePluginRuntimeStoragePath();
  private readonly runtimeEventLogService: RuntimeEventLogService;
  private cronSchedulerReady = false;

  constructor(
    @Optional() private readonly pluginPersistenceService?: PluginPersistenceService,
    @Optional() private readonly runtimeHostPluginDispatchService?: RuntimeHostPluginDispatchService,
    @Optional() runtimeEventLogService?: RuntimeEventLogService,
  ) {
    this.runtimeEventLogService = runtimeEventLogService ?? new RuntimeEventLogService();
    const restored = this.readStoredRuntimeState();
    this.cronSequence = restored.cronSequence;
    for (const [pluginId, store] of restored.stateStore.entries()) {
      this.stateStore.set(pluginId, store);
    }
    for (const [pluginId, store] of restored.storageStore.entries()) {
      this.storageStore.set(pluginId, store);
    }
    for (const [pluginId, jobs] of restored.cronJobs.entries()) {
      this.cronJobs.set(pluginId, jobs);
    }
    if (restored.migrated) {
      this.persistRuntimeState();
    }
  }

  onApplicationBootstrap(): void {
    this.cronSchedulerReady = true;
    this.reconcileAllCronJobs();
  }

  onModuleDestroy(): void {
    for (const timer of this.cronTimers.values()) {
      clearTimeout(timer);
    }
    this.cronTimers.clear();
  }

  deleteCronJob(pluginId: string, params: JsonObject): JsonValue {
    const jobId = readRequiredString(params, 'jobId');
    const jobs = this.reconcilePluginCronJobs(pluginId);
    const target = jobs.find((job) => job.id === jobId);
    if (!target || target.source !== 'host') {
      return false;
    }
    const nextJobs = jobs.filter((job) => job.id !== jobId);
    this.writePluginCronJobs(pluginId, nextJobs);
    this.clearCronTimer(jobId);
    return true;
  }

  deletePluginStorage(pluginId: string, key: string): boolean {
    const deleted = this.getPluginStore('storage', pluginId).delete(key);
    if (deleted) {
      this.persistRuntimeState();
    }
    return deleted;
  }

  deleteStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const deleted = this.getPluginStore(surface, pluginId).delete(this.buildScopedKey(context, params));
    if (deleted) {
      this.persistRuntimeState();
    }
    return deleted;
  }

  getStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const store = this.getPluginStore(surface, pluginId);
    const key = this.buildScopedKey(context, params);
    return store.has(key) ? cloneJsonValue(store.get(key) ?? null) : null;
  }

  listCronJobs(pluginId: string): JsonValue {
    return this.reconcilePluginCronJobs(pluginId)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((job) => asJsonValue(job));
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
    const cron = readRequiredString(params, 'cron');
    assertCronExpressionValid(cron);
    const now = new Date().toISOString();
    const record: RuntimeCronJobRecord = {
      createdAt: now,
      cron,
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
    if (description) {
      record.description = description;
    }
    const data = readJsonValue(params.data);
    if (data !== null) {
      record.data = data;
    }

    const jobs = this.reconcilePluginCronJobs(pluginId);
    this.writePluginCronJobs(pluginId, [...jobs, record]);
    if (this.cronSchedulerReady) {
      this.syncCronTimer(record);
    }
    return asJsonValue(record);
  }

  setPluginStorage(pluginId: string, key: string, value: JsonValue): JsonValue {
    const store = this.getPluginStore('storage', pluginId);
    store.set(key, cloneJsonValue(value));
    this.persistRuntimeState();
    return cloneJsonValue(value);
  }

  setStoreValue(surface: 'state' | 'storage', pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const value = readRequiredJsonValue(params, 'value');
    this.getPluginStore(surface, pluginId).set(this.buildScopedKey(context, params), cloneJsonValue(value));
    this.persistRuntimeState();
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
    if (existing) {
      return existing;
    }
    const created = new Map<string, JsonValue>();
    surfaceStore.set(pluginId, created);
    return created;
  }

  private readStoredRuntimeState(): RuntimePluginRuntimeSnapshot {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {
        return emptyRuntimePluginSnapshot();
      }
      const payload = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as RuntimePluginRuntimeStoragePayload;
      const stateStore = new Map<string, Map<string, JsonValue>>();
      const storageStore = new Map<string, Map<string, JsonValue>>();
      const cronJobs = new Map<string, RuntimeCronJobRecord[]>();
      let migrated = false;
      for (const [pluginId, pluginStore] of Object.entries(payload.plugins ?? {})) {
        const stateEntries = readJsonRecordEntries(pluginStore.state);
        const storageEntries = readJsonRecordEntries(pluginStore.storage);
        const persistedCrons = readPersistedCronJobs(pluginId, pluginStore.crons);
        if (pluginStore.state && Object.keys(pluginStore.state).length !== stateEntries.length) {
          migrated = true;
        }
        if (pluginStore.storage && Object.keys(pluginStore.storage).length !== storageEntries.length) {
          migrated = true;
        }
        if ((pluginStore.crons?.length ?? 0) !== persistedCrons.length) {
          migrated = true;
        }
        if (stateEntries.length > 0) {
          stateStore.set(pluginId, new Map(stateEntries));
        }
        if (storageEntries.length > 0) {
          storageStore.set(pluginId, new Map(storageEntries));
        }
        if (persistedCrons.length > 0) {
          cronJobs.set(pluginId, persistedCrons);
        }
      }
      return {
        cronJobs,
        cronSequence: typeof payload.cronSequence === 'number' ? payload.cronSequence : 0,
        migrated,
        stateStore,
        storageStore,
      };
    } catch {
      return emptyRuntimePluginSnapshot();
    }
  }

  private persistRuntimeState(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const plugins: Record<string, RuntimePluginRuntimePluginStorePayload> = {};
    const payload: RuntimePluginRuntimeStoragePayload = {
      cronSequence: this.cronSequence,
      plugins,
    };
    for (const pluginId of this.listPersistedPluginIds()) {
      const state = this.stateStore.get(pluginId);
      const storage = this.storageStore.get(pluginId);
      const crons = this.cronJobs.get(pluginId);
      if (!state && !storage && !crons) {
        continue;
      }
      plugins[pluginId] = {
        ...(crons ? { crons: crons.map((job) => cloneRuntimeCronJobRecord(job)) } : {}),
        ...(state ? { state: Object.fromEntries([...state.entries()].map(([key, value]) => [key, cloneJsonValue(value)])) } : {}),
        ...(storage ? { storage: Object.fromEntries([...storage.entries()].map(([key, value]) => [key, cloneJsonValue(value)])) } : {}),
      };
    }
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private listPersistedPluginIds(): string[] {
    return [...new Set([
      ...this.stateStore.keys(),
      ...this.storageStore.keys(),
      ...this.cronJobs.keys(),
    ])].sort((left, right) => left.localeCompare(right));
  }

  private reconcileAllCronJobs(): void {
    const pluginIds = new Set<string>([
      ...this.cronJobs.keys(),
      ...(this.pluginPersistenceService?.listPlugins().map((plugin) => plugin.pluginId) ?? []),
    ]);
    for (const pluginId of pluginIds) {
      this.reconcilePluginCronJobs(pluginId);
    }
  }

  private reconcilePluginCronJobs(pluginId: string): RuntimeCronJobRecord[] {
    const persistedJobs = this.cronJobs.get(pluginId) ?? [];
    if (!this.pluginPersistenceService) {
      if (this.cronSchedulerReady) {
        for (const job of persistedJobs) {
          this.syncCronTimer(job);
        }
      }
      return persistedJobs.map((job) => cloneRuntimeCronJobRecord(job));
    }
    const plugin = this.pluginPersistenceService?.findPlugin(pluginId) ?? null;
    if (!plugin) {
      if (persistedJobs.length > 0) {
        for (const job of persistedJobs) {
          this.clearCronTimer(job.id);
        }
        this.cronJobs.delete(pluginId);
        this.persistRuntimeState();
      }
      return [];
    }
    const nextJobs = mergeRuntimeCronJobs(pluginId, persistedJobs, plugin.manifest.crons ?? []);
    const changed = haveCronJobsChanged(persistedJobs, nextJobs);
    if (changed) {
      const removedIds = new Set(
        persistedJobs
          .filter((job) => !nextJobs.some((nextJob) => nextJob.id === job.id))
          .map((job) => job.id),
      );
      for (const jobId of removedIds) {
        this.clearCronTimer(jobId);
      }
      this.writePluginCronJobs(pluginId, nextJobs);
    } else if (this.cronSchedulerReady) {
      for (const job of nextJobs) {
        this.syncCronTimer(job);
      }
    }
    return nextJobs;
  }

  private writePluginCronJobs(pluginId: string, jobs: RuntimeCronJobRecord[]): void {
    if (jobs.length > 0) {
      this.cronJobs.set(pluginId, jobs.map((job) => cloneRuntimeCronJobRecord(job)));
    } else {
      this.cronJobs.delete(pluginId);
    }
    this.persistRuntimeState();
    if (this.cronSchedulerReady) {
      const activeJobIds = new Set(jobs.map((job) => job.id));
      for (const [jobId] of this.cronTimers.entries()) {
        if (!activeJobIds.has(jobId) && ![...this.cronJobs.values()].some((records) => records.some((job) => job.id === jobId))) {
          this.clearCronTimer(jobId);
        }
      }
      for (const job of jobs) {
        this.syncCronTimer(job);
      }
    }
  }

  private syncCronTimer(job: RuntimeCronJobRecord): void {
    this.clearCronTimer(job.id);
    if (!job.enabled) {
      return;
    }
    const nextDelay = readCronNextDelay(job.cron, new Date());
    if (nextDelay === null) {
      const now = new Date().toISOString();
      this.updateCronJob(job.pluginId, job.id, () => ({
        ...job,
        lastError: `不支持的 cron 表达式: ${job.cron}`,
        lastErrorAt: now,
        updatedAt: now,
      }), false);
      return;
    }
    const timer = setTimeout(() => {
      void this.runCronJob(job.pluginId, job.id);
    }, nextDelay);
    timer.unref?.();
    this.cronTimers.set(job.id, timer);
  }

  private clearCronTimer(jobId: string): void {
    const timer = this.cronTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
    }
    this.cronTimers.delete(jobId);
  }

  private async runCronJob(pluginId: string, jobId: string): Promise<void> {
    const job = this.cronJobs.get(pluginId)?.find((entry) => entry.id === jobId);
    if (!job || !job.enabled) {
      this.clearCronTimer(jobId);
      return;
    }
    const tickedAt = new Date().toISOString();
    const errorMessage = await this.invokeCronHook(job, tickedAt);
    this.updateCronJob(pluginId, jobId, (current) => ({
      ...current,
      lastError: errorMessage,
      lastErrorAt: errorMessage ? tickedAt : null,
      lastRunAt: tickedAt,
      updatedAt: tickedAt,
    }));
  }

  private async invokeCronHook(job: RuntimeCronJobRecord, tickedAt: string): Promise<string | null> {
    const plugin = this.pluginPersistenceService?.findPlugin(job.pluginId) ?? null;
    if (!plugin) {
      return `Plugin not found: ${job.pluginId}`;
    }
    if (!plugin.manifest.hooks?.some((hook) => hook.name === 'cron:tick')) {
      return `Plugin ${job.pluginId} 未声明 cron:tick hook`;
    }
    if (!this.runtimeHostPluginDispatchService) {
      return 'RuntimeHostPluginDispatchService 不可用';
    }
    const payload: PluginCronTickPayload = {
      job: cloneRuntimeCronJobRecord(job),
      tickedAt,
    };
    try {
      await this.runtimeHostPluginDispatchService.invokeHook({
        context: {
          cronJobId: job.id,
          metadata: {
            cron: job.cron,
            name: job.name,
          },
          source: 'cron',
          userId: SINGLE_USER_ID,
        },
        hookName: 'cron:tick',
        payload: asJsonValue(payload),
        pluginId: job.pluginId,
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  private updateCronJob(
    pluginId: string,
    jobId: string,
    update: (job: RuntimeCronJobRecord) => RuntimeCronJobRecord,
    reschedule: boolean = true,
  ): void {
    const jobs = this.cronJobs.get(pluginId) ?? [];
    const nextJobs = jobs.map((job) => job.id === jobId ? cloneRuntimeCronJobRecord(update(job)) : cloneRuntimeCronJobRecord(job));
    this.cronJobs.set(pluginId, nextJobs);
    this.persistRuntimeState();
    if (!this.cronSchedulerReady) {
      return;
    }
    if (reschedule) {
      const updatedJob = nextJobs.find((job) => job.id === jobId);
      if (updatedJob) {
        this.syncCronTimer(updatedJob);
      } else {
        this.clearCronTimer(jobId);
      }
    }
  }
}

function resolvePluginRuntimeStoragePath(): string {
  if (process.env.GARLIC_CLAW_PLUGIN_RUNTIME_STATE_PATH) {
    return process.env.GARLIC_CLAW_PLUGIN_RUNTIME_STATE_PATH;
  }
  if (process.env.JEST_WORKER_ID) {
    return createServerTestArtifactPath({ extension: '.json', prefix: 'plugin-runtime.server.test', subdirectory: 'server' });
  }
  return resolveServerStatePath('plugin-runtime.server.json');
}

function emptyRuntimePluginSnapshot(): RuntimePluginRuntimeSnapshot {
  return {
    cronJobs: new Map<string, RuntimeCronJobRecord[]>(),
    cronSequence: 0,
    migrated: false,
    stateStore: new Map<string, Map<string, JsonValue>>(),
    storageStore: new Map<string, Map<string, JsonValue>>(),
  };
}

function readJsonRecordEntries(record: Record<string, JsonValue> | undefined): Array<[string, JsonValue]> {
  if (!record) {
    return [];
  }
  return Object.entries(record).flatMap(([key, value]) => typeof value === 'undefined' ? [] : [[key, cloneJsonValue(value)]]);
}

function readPersistedCronJobs(pluginId: string, jobs: RuntimeCronJobRecord[] | undefined): RuntimeCronJobRecord[] {
  if (!Array.isArray(jobs)) {
    return [];
  }
  return jobs.flatMap((job) => isPersistedCronJobRecord(job, pluginId) ? [cloneRuntimeCronJobRecord(job)] : []);
}

function isPersistedCronJobRecord(job: RuntimeCronJobRecord, pluginId: string): boolean {
  return typeof job.id === 'string'
    && typeof job.pluginId === 'string'
    && job.pluginId === pluginId
    && typeof job.name === 'string'
    && typeof job.cron === 'string'
    && (job.source === 'host' || job.source === 'manifest')
    && typeof job.enabled === 'boolean'
    && typeof job.createdAt === 'string'
    && typeof job.updatedAt === 'string'
    && (typeof job.lastRunAt === 'string' || job.lastRunAt === null)
    && (typeof job.lastError === 'string' || job.lastError === null)
    && (typeof job.lastErrorAt === 'string' || job.lastErrorAt === null);
}

function mergeRuntimeCronJobs(
  pluginId: string,
  persistedJobs: RuntimeCronJobRecord[],
  manifestCrons: PluginCronDescriptor[],
): RuntimeCronJobRecord[] {
  const hostJobs = persistedJobs.filter((job) => job.source === 'host').map((job) => cloneRuntimeCronJobRecord(job));
  const persistedManifestJobs = new Map(
    persistedJobs
      .filter((job) => job.source === 'manifest')
      .map((job) => [job.id, job] as const),
  );
  const mergedManifestJobs = manifestCrons.map((descriptor) => {
    const id = createManifestCronJobId(pluginId, descriptor.name);
    const existing = persistedManifestJobs.get(id);
    const now = new Date().toISOString();
    return {
      createdAt: existing?.createdAt ?? now,
      cron: descriptor.cron,
      ...(descriptor.data !== undefined ? { data: cloneJsonValue(descriptor.data) } : {}),
      ...(descriptor.description ? { description: descriptor.description } : {}),
      enabled: descriptor.enabled ?? true,
      id,
      lastError: existing?.lastError ?? null,
      lastErrorAt: existing?.lastErrorAt ?? null,
      lastRunAt: existing?.lastRunAt ?? null,
      name: descriptor.name,
      pluginId,
      source: 'manifest' as const,
      updatedAt: existing
        && existing.cron === descriptor.cron
        && existing.enabled === (descriptor.enabled ?? true)
        && existing.description === descriptor.description
        && JSON.stringify(existing.data ?? null) === JSON.stringify(descriptor.data ?? null)
        ? existing.updatedAt
        : now,
    } satisfies RuntimeCronJobRecord;
  });
  return [...hostJobs, ...mergedManifestJobs];
}

function haveCronJobsChanged(previous: RuntimeCronJobRecord[], next: RuntimeCronJobRecord[]): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function createManifestCronJobId(pluginId: string, name: string): string {
  return `manifest-cron:${pluginId}:${name.trim()}`;
}

function cloneRuntimeCronJobRecord(job: RuntimeCronJobRecord): RuntimeCronJobRecord {
  return structuredClone(job);
}

function assertCronExpressionValid(expression: string): void {
  if (readCronNextDelay(expression, new Date()) !== null) {
    return;
  }
  throw new BadRequestException(`不支持的 cron 表达式: ${expression}`);
}

function readCronNextDelay(expression: string, currentDate: Date): number | null {
  const intervalMs = readIntervalCronDelay(expression);
  if (intervalMs !== null) {
    return intervalMs;
  }
  try {
    const nextDate = CronExpressionParser.parse(expression, { currentDate }).next().toDate();
    return Math.max(nextDate.getTime() - currentDate.getTime(), 1);
  } catch {
    return null;
  }
}

function readIntervalCronDelay(expression: string): number | null {
  const match = expression.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  const unit = match[2].toLowerCase();
  if (unit === 's') {
    return value * 1_000;
  }
  if (unit === 'm') {
    return value * 60_000;
  }
  return value * 3_600_000;
}
