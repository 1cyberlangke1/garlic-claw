import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginCallContext, PluginSubagentDetail, PluginSubagentOverview, PluginSubagentRequest, PluginSubagentSummary } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { resolveServerStatePath } from '../server-workspace-paths';
import { cloneJsonValue } from './runtime-host-values';

export type RuntimeSubagentRecord = PluginSubagentDetail & {
  id: string;
  removedAt?: string;
  visibility: 'background' | 'inline';
  writeBackConversationRevision?: string;
};

@Injectable()
export class RuntimeHostSubagentStoreService {
  private readonly storagePath = process.env.GARLIC_CLAW_SUBAGENTS_PATH ?? resolveServerStatePath('subagents.server.json');
  private readonly subagents: Map<string, RuntimeSubagentRecord[]>;
  private subagentSequence = 0;

  constructor() {
    const stored = readSubagentStorage(this.storagePath);
    this.subagentSequence = stored.subagentSequence;
    this.subagents = stored.subagents;
  }

  getSubagent(pluginId: string, sessionId: string): PluginSubagentDetail { return toSubagentDetail(this.requireSessionProjection(sessionId, pluginId)); }
  getSubagentOrThrow(sessionId: string): PluginSubagentDetail { return toSubagentDetail(this.requireSessionProjection(sessionId)); }
  summarizeSubagent(subagent: RuntimeSubagentRecord): PluginSubagentSummary { return toSubagentSummary(subagent); }
  readSubagent(subagentId: string, pluginId?: string): RuntimeSubagentRecord { return cloneJsonValue(this.requireSubagent(subagentId, pluginId)) as RuntimeSubagentRecord; }
  listOverview(): PluginSubagentOverview { return { subagents: this.readSessionProjection().map(toSubagentSummary) }; }
  listSubagents(pluginId: string): PluginSubagentSummary[] { return this.readSessionProjection(pluginId, undefined, true).map(toSubagentSummary); }
  listPendingSubagents(pluginId?: string): RuntimeSubagentRecord[] { return this.readRecords(pluginId).filter((item) => item.status === 'queued' || item.status === 'running').map(copySubagentRecord); }

  removeSession(sessionId: string, pluginId?: string): boolean {
    const records = this.readRecords(pluginId, undefined, true).filter((item) => item.sessionId === sessionId && !item.removedAt);
    if (records.length === 0) { return false; }
    const removedAt = new Date().toISOString();
    records.forEach((item) => { item.removedAt = removedAt; });
    this.saveSubagents();
    return true;
  }

  createSubagent(input: {
    context: PluginCallContext;
    conversationRevision?: string;
    pluginDisplayName: string | undefined;
    pluginId: string;
    request: PluginSubagentRequest;
    requestPreview: string;
    sessionId: string;
    sessionMessageCount: number;
    sessionUpdatedAt: string;
    subagentType?: string;
    subagentTypeName?: string;
    visibility: 'background' | 'inline';
    writeBackTarget: PluginSubagentSummary['writeBackTarget'] | null;
  }): RuntimeSubagentRecord {
    const subagent: RuntimeSubagentRecord = {
      context: cloneJsonValue(input.context),
      finishedAt: null,
      id: `subagent-${++this.subagentSequence}`,
      modelId: input.request.modelId,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      providerId: input.request.providerId,
      request: input.request,
      requestPreview: input.requestPreview,
      requestedAt: new Date().toISOString(),
      result: null,
      resultPreview: undefined,
      runtimeKind: 'local',
      sessionId: input.sessionId,
      sessionMessageCount: input.sessionMessageCount,
      sessionUpdatedAt: input.sessionUpdatedAt,
      startedAt: null,
      status: 'queued',
      visibility: input.visibility,
      writeBackError: undefined,
      writeBackMessageId: undefined,
      writeBackStatus: input.writeBackTarget ? 'pending' : 'skipped',
      ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
      ...(input.context.userId ? { userId: input.context.userId } : {}),
      ...(input.conversationRevision ? { writeBackConversationRevision: input.conversationRevision } : {}),
      ...(input.request.description ? { description: input.request.description } : {}),
      ...(input.subagentType ? { subagentType: input.subagentType } : {}),
      ...(input.subagentTypeName ? { subagentTypeName: input.subagentTypeName } : {}),
      ...(input.writeBackTarget ? { writeBackTarget: input.writeBackTarget } : {}),
    };
    const records = this.subagents.get(input.pluginId) ?? [];
    records.push(subagent);
    this.subagents.set(input.pluginId, records);
    this.saveSubagents();
    return copySubagentRecord(subagent);
  }

  updateSubagent(pluginId: string, subagentId: string, mutate: (subagent: RuntimeSubagentRecord, now: string) => void): void {
    mutate(this.requireSubagent(subagentId, pluginId), new Date().toISOString());
    this.saveSubagents();
  }

  private readRecords(pluginId?: string, visibility?: RuntimeSubagentRecord['visibility'], includeRemoved = false): RuntimeSubagentRecord[] {
    const records = pluginId ? (this.subagents.get(pluginId) ?? []) : [...this.subagents.values()].flat();
    return records.filter((item) => (includeRemoved || !item.removedAt) && (!visibility || item.visibility === visibility));
  }

  private readSessionProjection(pluginId?: string, visibility?: RuntimeSubagentRecord['visibility'], ascending = false): RuntimeSubagentRecord[] {
    const latestBySession = new Map<string, RuntimeSubagentRecord>();
    for (const subagent of this.readRecords(pluginId, visibility)) {
      const current = latestBySession.get(subagent.sessionId);
      if (!current || current.requestedAt.localeCompare(subagent.requestedAt) < 0 || (current.requestedAt === subagent.requestedAt && current.id.localeCompare(subagent.id) < 0)) {
        latestBySession.set(subagent.sessionId, subagent);
      }
    }
    const direction = ascending ? 1 : -1;
    return [...latestBySession.values()].sort((left, right) => direction * left.requestedAt.localeCompare(right.requestedAt));
  }

  private requireSubagent(subagentId: string, pluginId?: string): RuntimeSubagentRecord {
    const subagent = this.readRecords(pluginId, undefined, true).find((item) => item.id === subagentId);
    if (subagent) { return subagent; }
    throw new NotFoundException(`Subagent not found: ${subagentId}`);
  }

  private requireSessionProjection(sessionId: string, pluginId?: string): RuntimeSubagentRecord {
    const subagent = this.readSessionProjection(pluginId).find((item) => item.sessionId === sessionId);
    if (subagent) { return subagent; }
    throw new NotFoundException(`Subagent session not found: ${sessionId}`);
  }

  private saveSubagents(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({ subagentSequence: this.subagentSequence, subagents: Object.fromEntries(this.subagents) }, null, 2), 'utf-8');
  }
}

function copySubagentRecord(subagent: RuntimeSubagentRecord): RuntimeSubagentRecord {
  return cloneJsonValue(subagent) as RuntimeSubagentRecord;
}

function readSubagentStorage(storagePath: string): { subagentSequence: number; subagents: Map<string, RuntimeSubagentRecord[]> } {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) { return { subagentSequence: 0, subagents: new Map<string, RuntimeSubagentRecord[]>() }; }
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as { subagentSequence?: number; subagents?: Record<string, RuntimeSubagentRecord[]> };
    return {
      subagentSequence: typeof parsed.subagentSequence === 'number' ? parsed.subagentSequence : 0,
      subagents: new Map(Object.entries(parsed.subagents ?? {}).map(([pluginId, records]) => [pluginId, Array.isArray(records) ? records.map(normalizeSubagentRecord) : []])),
    };
  } catch {
    return { subagentSequence: 0, subagents: new Map<string, RuntimeSubagentRecord[]>() };
  }
}

function toSubagentSummary(subagent: RuntimeSubagentRecord): PluginSubagentSummary {
  const { context: _context, id: _id, request: _request, result: _result, ...summary } = copySubagentRecord(subagent);
  return summary;
}

function toSubagentDetail(subagent: RuntimeSubagentRecord): PluginSubagentDetail {
  const { id: _id, ...detail } = copySubagentRecord(subagent);
  return detail;
}

function normalizeSubagentRecord(subagent: RuntimeSubagentRecord): RuntimeSubagentRecord {
  return {
    ...subagent,
    ...(typeof subagent.removedAt === 'string' && subagent.removedAt.trim().length > 0 ? { removedAt: subagent.removedAt } : {}),
    sessionId: typeof subagent.sessionId === 'string' && subagent.sessionId.trim().length > 0 ? subagent.sessionId : subagent.id,
    sessionMessageCount: typeof subagent.sessionMessageCount === 'number' ? subagent.sessionMessageCount : subagent.request.messages.length,
    sessionUpdatedAt: typeof subagent.sessionUpdatedAt === 'string' && subagent.sessionUpdatedAt.trim().length > 0 ? subagent.sessionUpdatedAt : subagent.requestedAt,
    visibility: subagent.visibility === 'inline' ? 'inline' : 'background',
  };
}
