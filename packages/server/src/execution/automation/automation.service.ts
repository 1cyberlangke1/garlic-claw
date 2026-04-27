import fs from 'node:fs';
import path from 'node:path';
import type { ActionConfig, AutomationEventDispatchInfo, AutomationLogInfo, JsonObject, JsonValue, TriggerConfig, ToolSourceKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { createServerTestArtifactPath, resolveServerStatePath } from '../../runtime/server-workspace-paths';
import { asJsonValue, cloneJsonValue, readJsonObject, readRequiredString } from '../../runtime/host/runtime-host-values';
import { AutomationExecutionService } from './automation-execution.service';

export interface PersistedAutomationRecord {
  actions: ActionConfig[];
  createdAt: string;
  enabled: boolean;
  id: string;
  lastRunAt: string | null;
  logs: AutomationLogInfo[];
  name: string;
  trigger: TriggerConfig;
  updatedAt: string;
  userId: string;
}

export interface RuntimeAutomationRecord extends PersistedAutomationRecord {}
interface AutomationPersistenceFile { automations: Record<string, RuntimeAutomationRecord[]>; sequence: number; }
interface AutomationStateSnapshot { automations: Map<string, RuntimeAutomationRecord[]>; migrated: boolean; sequence: number; }
export type AutomationRunContext = { automationId: string; source: 'automation'; userId: string };

@Injectable()
export class AutomationService implements OnModuleDestroy, OnModuleInit {
  private readonly automations = new Map<string, RuntimeAutomationRecord[]>();
  private readonly cronJobs = new Map<string, ReturnType<typeof setInterval>>();
  private automationSequence = 0;
  private readonly logger = new Logger(AutomationService.name);
  private readonly storagePath = resolveAutomationStoragePath();

  constructor(private readonly automationExecutionService: AutomationExecutionService) {
    const restored = readAutomationState(this.storagePath);
    this.automationSequence = restored.sequence;
    for (const [userId, records] of restored.automations.entries()) { this.automations.set(userId, records); }
    if (restored.migrated) { this.persist(); }
  }

  onModuleInit(): void { for (const automation of readAllAutomations(this.automations)) {if (automation.enabled) {this.syncCronJob(automation.id, automation.trigger, true);}} }
  onModuleDestroy(): void { for (const timer of this.cronJobs.values()) {clearInterval(timer);} this.cronJobs.clear(); }

  create(userId: string, params: JsonObject): JsonValue {
    const record = createAutomationRecord(userId, params, ++this.automationSequence);
    this.automations.set(userId, [...readUserAutomations(this.automations, userId), record]);
    this.syncCronJob(record.id, record.trigger, true); this.persist();
    return serializeAutomationRecord(record);
  }

  async emitEvent(userId: string, event: string): Promise<AutomationEventDispatchInfo> {
    const matchedAutomationIds: string[] = [];
    for (const automation of readEventAutomations(readUserAutomations(this.automations, userId), event)) {
      await this.runRecord(automation);
      matchedAutomationIds.push(automation.id);
    }
    return { event, matchedAutomationIds };
  }

  listByUser(userId: string): JsonValue { return readUserAutomations(this.automations, userId).map((automation) => serializeAutomationRecord(automation)); }
  getById(userId: string, automationId: string): JsonValue { return serializeAutomationRecord(this.requireAutomation(userId, automationId)); }
  getLogs(userId: string, automationId: string): JsonValue { return this.requireAutomation(userId, automationId).logs.map((log) => asJsonValue(log)); }
  async run(userId: string, automationId: string): Promise<JsonValue> { return this.runRecord(this.requireAutomation(userId, automationId)); }

  toggle(userId: string, automationId: string): JsonValue {
    const automation = this.requireAutomation(userId, automationId);
    automation.enabled = !automation.enabled;
    automation.updatedAt = new Date().toISOString();
    this.syncCronJob(automation.id, automation.trigger, automation.enabled);
    this.persist();
    return { enabled: automation.enabled, id: automation.id };
  }

  remove(userId: string, automationId: string): JsonValue {
    const records = readUserAutomations(this.automations, userId);
    const nextRecords = records.filter((record) => record.id !== automationId);
    if (nextRecords.length === records.length) { throw new NotFoundException(`Automation not found: ${automationId}`); }
    this.automations.set(userId, nextRecords);
    this.removeCronJob(automationId); this.persist();
    return { count: 1 };
  }

  private requireAutomation(userId: string, automationId: string): RuntimeAutomationRecord {
    const automation = readUserAutomations(this.automations, userId).find((record) => record.id === automationId);
    if (!automation) { throw new NotFoundException(`Automation not found: ${automationId}`); }
    return automation;
  }

  private async runRecord(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    const startedAt = new Date().toISOString();
    automation.lastRunAt = startedAt;
    automation.updatedAt = startedAt;
    const result = await this.automationExecutionService.executeAutomation(automation);
    automation.logs.unshift(createAutomationLog(automation, startedAt, result));
    this.persist();
    return result;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({ automations: Object.fromEntries([...this.automations.entries()].map(([userId, records]) => [userId, cloneJsonValue(records)])), sequence: this.automationSequence } satisfies AutomationPersistenceFile, null, 2), 'utf-8');
  }

  private syncCronJob(automationId: string, trigger: TriggerConfig, enabled: boolean): boolean {
    if (!enabled || trigger.type !== 'cron' || !trigger.cron) { this.removeCronJob(automationId); return false; }
    const intervalMs = readCronInterval(trigger.cron);
    this.removeCronJob(automationId);
    if (!intervalMs) { this.logger.warn(`自动化 ${automationId} 的 cron 表达式无效：${trigger.cron}`); return false; }
    this.cronJobs.set(automationId, setInterval(() => {
      const automation = readAllAutomations(this.automations).find((record) => record.id === automationId);
      if (automation) {
        void this.runRecord(automation).catch((error: Error) => { this.logger.error(`自动化 ${automationId} 的 cron 执行失败：${error.message}`); });
      }
    }, intervalMs));
    this.logger.log(`已为自动化 ${automationId} 计划 cron：每 ${trigger.cron}`);
    return true;
  }

  private removeCronJob(automationId: string): void {
    const timer = this.cronJobs.get(automationId);
    if (timer) { clearInterval(timer); }
    this.cronJobs.delete(automationId);
  }
}

function createAutomationRecord(userId: string, params: JsonObject, sequence: number): RuntimeAutomationRecord {
  const now = new Date().toISOString();
  return { actions: readAutomationActions(params), createdAt: now, enabled: true, id: `automation-${sequence}`, lastRunAt: null, logs: [], name: readRequiredString(params, 'name'), trigger: readAutomationTrigger(params), updatedAt: now, userId };
}

function createAutomationLog(automation: RuntimeAutomationRecord, createdAt: string, result: JsonValue): AutomationLogInfo {
  return { id: `automation-log-${automation.id}-${automation.logs.length + 1}`, status: readAutomationRunStatus(result), result: JSON.stringify(result), createdAt };
}

function serializeAutomationRecord(automation: RuntimeAutomationRecord): JsonValue {
  const { userId: _userId, ...rest } = automation;
  return asJsonValue(rest);
}

function readAutomationState(storagePath: string): AutomationStateSnapshot {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) {return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };}
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as Partial<AutomationPersistenceFile>;
    const persistedAutomations = parsed.automations ?? {};
    const currentRecords = cloneJsonValue(persistedAutomations[SINGLE_USER_ID] ?? []).filter((record: RuntimeAutomationRecord) => record.userId === SINGLE_USER_ID);
    const persistedCurrent = persistedAutomations[SINGLE_USER_ID] ?? [];
    return {
      automations: new Map(currentRecords.length > 0 ? [[SINGLE_USER_ID, currentRecords]] : []),
      migrated: Object.keys(persistedAutomations).length > (currentRecords.length > 0 ? 1 : 0) || currentRecords.length !== persistedCurrent.length,
      sequence: typeof parsed.sequence === 'number' ? parsed.sequence : 0,
    };
  } catch {
    return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };
  }
}

function readAllAutomations(automations: Map<string, RuntimeAutomationRecord[]>): RuntimeAutomationRecord[] { return [...automations.values()].flat(); }
function readUserAutomations(automations: Map<string, RuntimeAutomationRecord[]>, userId: string): RuntimeAutomationRecord[] { return automations.get(userId) ?? []; }
function readEventAutomations(records: RuntimeAutomationRecord[], event: string): RuntimeAutomationRecord[] { return records.filter((record) => record.enabled && record.trigger.type === 'event' && record.trigger.event === event); }

function readAutomationActions(params: JsonObject): ActionConfig[] {
  if (!Array.isArray(params.actions)) { throw new BadRequestException('actions must be an array'); }
  return params.actions.map((entry, index) => readAutomationAction(entry, index));
}

function readAutomationTrigger(params: JsonObject): TriggerConfig {
  const trigger = readJsonObject(params.trigger);
  if (!trigger) {throw new BadRequestException('trigger is required');}
  if (trigger.type !== 'cron' && trigger.type !== 'event' && trigger.type !== 'manual') {throw new BadRequestException('trigger.type is invalid');}
  return { type: trigger.type, ...(typeof trigger.cron === 'string' ? { cron: trigger.cron } : {}), ...(typeof trigger.event === 'string' ? { event: trigger.event } : {}) };
}

function readAutomationAction(value: JsonValue, index: number): ActionConfig {
  const action = readJsonObject(value);
  if (!action) { throw new BadRequestException(`actions[${index}] must be an object`); }
  if (action.type !== 'device_command' && action.type !== 'ai_message') { throw new BadRequestException(`actions[${index}].type is invalid`); }
  if (action.type === 'device_command') {
    const params = action.params === undefined ? undefined : readJsonObject(action.params);
    const capability = typeof action.capability === 'string' && action.capability.trim().length > 0 ? action.capability : null;
    const plugin = typeof action.plugin === 'string' && action.plugin.trim().length > 0 ? action.plugin : null;
    const sourceId = typeof action.sourceId === 'string' && action.sourceId.trim().length > 0 ? action.sourceId.trim() : null;
    const sourceKind = readAutomationToolSourceKind(action.sourceKind);
    if (action.params !== undefined && !params) { throw new BadRequestException(`actions[${index}].params must be an object`); }
    if (!capability || (!plugin && !(sourceKind && sourceId))) { throw new BadRequestException(`actions[${index}].type is missing required fields`); }
    return { capability, ...(params ? { params } : {}), ...(plugin ? { plugin } : {}), ...(sourceId ? { sourceId } : {}), ...(sourceKind ? { sourceKind } : {}), type: action.type };
  }
  const target = action.target ? readJsonObject(action.target) : null;
  if (action.target && (!target || target.type !== 'conversation' || typeof target.id !== 'string')) {
    throw new BadRequestException(`actions[${index}].target is invalid`);
  }
  return {
    ...(typeof action.message === 'string' ? { message: action.message } : {}),
    ...(target && typeof target.id === 'string' ? { target: { id: target.id, type: 'conversation' as const } } : {}),
    type: action.type,
  };
}

function readAutomationRunStatus(result: JsonValue): string {
  return typeof result === 'object' && result !== null && typeof (result as { status?: unknown }).status === 'string' ? (result as { status: string }).status : 'success';
}

function readAutomationToolSourceKind(value: unknown): ToolSourceKind | null {
  return value === 'internal' || value === 'plugin' || value === 'mcp' || value === 'skill'
    ? value
    : null;
}

function readCronInterval(expr: string): number | null {
  const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) { return null; }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 's') { return value >= 10 ? value * 1000 : null; }
  const unitMs = unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : null;
  return unitMs ? value * unitMs : null;
}

function resolveAutomationStoragePath(): string {
  if (process.env.GARLIC_CLAW_AUTOMATIONS_PATH) {
    return process.env.GARLIC_CLAW_AUTOMATIONS_PATH;
  }
  if (process.env.JEST_WORKER_ID) {
    return createServerTestArtifactPath({ extension: '.json', prefix: 'automations.server.test', subdirectory: 'server' });
  }
  return resolveServerStatePath('automations.server.json');
}
