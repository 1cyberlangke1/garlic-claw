import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  EventLogListResult,
  EventLogQuery,
  EventLogRecord,
  EventLogSettings,
  JsonObject,
  PluginEventLevel,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';

type RuntimeEventLogKind = 'mcp' | 'plugin' | 'skill';

interface RuntimeEventLogFile {
  records: EventLogRecord[];
}

interface RuntimeEventLogInput {
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
  type: string;
}

@Injectable()
export class RuntimeEventLogService {
  private readonly logRootPath = resolveEventLogRootPath();

  appendLog(
    kind: RuntimeEventLogKind,
    entityId: string,
    settings: EventLogSettings | null | undefined,
    input: RuntimeEventLogInput,
  ): EventLogRecord | null {
    const normalizedSettings = normalizeEventLogSettings(settings);
    if (normalizedSettings.maxFileSizeMb <= 0) {
      return null;
    }

    const record: EventLogRecord = {
      createdAt: new Date().toISOString(),
      id: `event-log-${randomUUID()}`,
      level: input.level,
      message: input.message,
      metadata: input.metadata ? structuredClone(input.metadata) : null,
      type: input.type,
    };
    const filePath = resolveEventLogFilePath(this.logRootPath, kind, entityId);
    const records = readRuntimeEventLogFile(filePath);
    records.push(record);
    writeRuntimeEventLogFile(
      filePath,
      trimRuntimeEventLogRecords(records, normalizedSettings.maxFileSizeMb),
    );
    return record;
  }

  listLogs(
    kind: RuntimeEventLogKind,
    entityId: string,
    query: EventLogQuery = {},
  ): EventLogListResult {
    const records = readRuntimeEventLogFile(
      resolveEventLogFilePath(this.logRootPath, kind, entityId),
    );
    const limit = query.limit ?? 50;
    const filtered = [...records]
      .reverse()
      .filter((record) => !query.level || record.level === query.level)
      .filter((record) => !query.type || record.type === query.type)
      .filter((record) => !query.keyword || runtimeEventLogMatchesKeyword(record, query.keyword))
      .filter((record) => !query.cursor || record.id !== query.cursor);
    const items = filtered.slice(0, limit);
    return {
      items,
      nextCursor: filtered.length > limit ? items.at(-1)?.id ?? null : null,
    };
  }
}

export function normalizeEventLogSettings(
  settings?: EventLogSettings | null,
): EventLogSettings {
  if (!settings || typeof settings.maxFileSizeMb !== 'number' || Number.isNaN(settings.maxFileSizeMb)) {
    return { maxFileSizeMb: 1 };
  }
  return {
    maxFileSizeMb: Math.max(0, settings.maxFileSizeMb),
  };
}

function readRuntimeEventLogFile(filePath: string): EventLogRecord[] {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<RuntimeEventLogFile>;
    return Array.isArray(parsed.records)
      ? parsed.records.map((record) => structuredClone(record))
      : [];
  } catch {
    return [];
  }
}

function writeRuntimeEventLogFile(filePath: string, records: EventLogRecord[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({
    records,
  } satisfies RuntimeEventLogFile, null, 2), 'utf8');
}

function trimRuntimeEventLogRecords(
  records: EventLogRecord[],
  maxFileSizeMb: number,
): EventLogRecord[] {
  const maxBytes = Math.floor(maxFileSizeMb * 1024 * 1024);
  if (maxBytes <= 0) {
    return [];
  }
  const nextRecords = records.map((record) => structuredClone(record));
  while (nextRecords.length > 0) {
    const serialized = JSON.stringify({ records: nextRecords });
    if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
      return nextRecords;
    }
    nextRecords.shift();
  }
  return [];
}

function runtimeEventLogMatchesKeyword(record: EventLogRecord, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase();
  return record.message.toLowerCase().includes(normalizedKeyword)
    || record.type.toLowerCase().includes(normalizedKeyword)
    || JSON.stringify(record.metadata ?? {}).toLowerCase().includes(normalizedKeyword);
}

function resolveEventLogFilePath(
  rootPath: string,
  kind: RuntimeEventLogKind,
  entityId: string,
): string {
  return path.join(rootPath, readRuntimeEventLogDirectoryName(kind), encodeURIComponent(entityId), 'events.json');
}

function readRuntimeEventLogDirectoryName(kind: RuntimeEventLogKind): string {
  if (kind === 'plugin') {
    return 'plugins';
  }
  if (kind === 'skill') {
    return 'skills';
  }
  return 'mcp';
}

function resolveEventLogRootPath(): string {
  if (process.env.GARLIC_CLAW_LOG_ROOT) {
    return path.resolve(process.env.GARLIC_CLAW_LOG_ROOT);
  }
  if (process.env.JEST_WORKER_ID) {
    return path.join(
      process.cwd(),
      'tmp',
      `log.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  }
  return path.join(resolveProjectRoot(), 'log');
}

function resolveProjectRoot(): string {
  return findProjectRoot(process.cwd())
    ?? findProjectRoot(__dirname)
    ?? process.cwd();
}

function findProjectRoot(startPath: string): string | null {
  let currentPath = path.resolve(startPath);
  while (true) {
    if (
      fs.existsSync(path.join(currentPath, 'package.json'))
      && fs.existsSync(path.join(currentPath, 'packages', 'server'))
    ) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}
