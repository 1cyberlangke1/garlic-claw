import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EventLogListResult, EventLogQuery, EventLogRecord, EventLogSettings, JsonObject, PluginEventLevel } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';

type RuntimeEventLogKind = 'mcp' | 'plugin' | 'skill';
type RuntimeEventLogInput = { level: PluginEventLevel; message: string; metadata?: JsonObject; type: string };

@Injectable()
export class RuntimeEventLogService {
  private readonly logRootPath = resolveEventLogRootPath();

  appendLog(kind: RuntimeEventLogKind, entityId: string, settings: EventLogSettings | null | undefined, input: RuntimeEventLogInput): EventLogRecord | null {
    const maxFileSizeMb = normalizeEventLogSettings(settings).maxFileSizeMb;
    if (maxFileSizeMb <= 0) {return null;}
    const record: EventLogRecord = { createdAt: new Date().toISOString(), id: `event-log-${randomUUID()}`, level: input.level, message: input.message, metadata: input.metadata ? structuredClone(input.metadata) : null, type: input.type };
    const filePath = resolveEventLogFilePath(this.logRootPath, kind, entityId), records = readRuntimeEventLogFile(filePath);
    records.push(record);
    writeRuntimeEventLogFile(filePath, trimRuntimeEventLogRecords(records, maxFileSizeMb));
    return record;
  }

  appendDetachedPluginAudit(entityId: string, settings: EventLogSettings | null | undefined, input: RuntimeEventLogInput): EventLogRecord | null {
    const maxFileSizeMb = normalizeEventLogSettings(settings).maxFileSizeMb;
    if (maxFileSizeMb <= 0) {return null;}
    const record: EventLogRecord = { createdAt: new Date().toISOString(), id: `event-log-${randomUUID()}`, level: input.level, message: input.message, metadata: input.metadata ? structuredClone(input.metadata) : null, type: input.type };
    const filePath = resolveDetachedPluginAuditFilePath(this.logRootPath, entityId), records = readRuntimeEventLogFile(filePath);
    records.push(record);
    writeRuntimeEventLogFile(filePath, trimRuntimeEventLogRecords(records, maxFileSizeMb));
    return record;
  }

  listLogs(kind: RuntimeEventLogKind, entityId: string, query: EventLogQuery = {}): EventLogListResult {
    const limit = query.limit ?? 50;
    const records = readRuntimeEventLogFile(resolveEventLogFilePath(this.logRootPath, kind, entityId)).reverse()
      .filter((record) => (!query.level || record.level === query.level) && (!query.type || record.type === query.type) && (!query.keyword || runtimeEventLogMatchesKeyword(record, query.keyword)));
    const cursorIndex = query.cursor ? records.findIndex((record) => record.id === query.cursor) : -1;
    const paged = cursorIndex < 0 ? (query.cursor ? [] : records) : records.slice(cursorIndex + 1);
    const items = paged.slice(0, limit);
    return { items, nextCursor: paged.length > limit ? items.at(-1)?.id ?? null : null };
  }

  deleteLogs(kind: RuntimeEventLogKind, entityId: string): void {
    const directoryPath = path.dirname(resolveEventLogFilePath(this.logRootPath, kind, entityId));
    fs.rmSync(directoryPath, { force: true, recursive: true });
  }
}

export function normalizeEventLogSettings(settings?: EventLogSettings | null): EventLogSettings {
  return !settings || typeof settings.maxFileSizeMb !== 'number' || Number.isNaN(settings.maxFileSizeMb) ? { maxFileSizeMb: 1 } : { maxFileSizeMb: Math.max(0, settings.maxFileSizeMb) };
}

function readRuntimeEventLogFile(filePath: string): EventLogRecord[] {
  try {
    return !fs.existsSync(filePath) ? [] : Array.isArray((JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records?: EventLogRecord[] }).records) ? ((JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records: EventLogRecord[] }).records.map((record) => structuredClone(record))) : [];
  } catch {
    return [];
  }
}

function writeRuntimeEventLogFile(filePath: string, records: EventLogRecord[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ records }, null, 2), 'utf8');
}

function trimRuntimeEventLogRecords(records: EventLogRecord[], maxFileSizeMb: number): EventLogRecord[] {
  const maxBytes = Math.floor(maxFileSizeMb * 1024 * 1024), nextRecords = records.map((record) => structuredClone(record));
  if (maxBytes <= 0) {return [];}
  while (nextRecords.length > 0 && Buffer.byteLength(JSON.stringify({ records: nextRecords }), 'utf8') > maxBytes) {nextRecords.shift();}
  return nextRecords;
}

function runtimeEventLogMatchesKeyword(record: EventLogRecord, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase();
  return record.message.toLowerCase().includes(normalizedKeyword) || record.type.toLowerCase().includes(normalizedKeyword) || JSON.stringify(record.metadata ?? {}).toLowerCase().includes(normalizedKeyword);
}

function resolveEventLogFilePath(rootPath: string, kind: RuntimeEventLogKind, entityId: string): string {
  return path.join(rootPath, kind === 'plugin' ? 'plugins' : kind === 'skill' ? 'skills' : 'mcp', encodeURIComponent(entityId), 'events.json');
}

function resolveDetachedPluginAuditFilePath(rootPath: string, entityId: string): string {
  return path.join(rootPath, 'deleted-plugins', encodeURIComponent(entityId), 'events.json');
}

function resolveEventLogRootPath(): string {
  if (process.env.GARLIC_CLAW_LOG_ROOT) {return path.resolve(process.env.GARLIC_CLAW_LOG_ROOT);}
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `log.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);}
  return path.join(resolveProjectRoot(), 'log');
}

function resolveProjectRoot(): string {
  return findProjectRoot(process.cwd()) ?? findProjectRoot(__dirname) ?? process.cwd();
}

function findProjectRoot(startPath: string): string | null {
  for (let currentPath = path.resolve(startPath); ; currentPath = path.dirname(currentPath)) {
    if (fs.existsSync(path.join(currentPath, 'package.json')) && fs.existsSync(path.join(currentPath, 'packages', 'server'))) {return currentPath;}
    if (path.dirname(currentPath) === currentPath) {return null;}
  }
}
