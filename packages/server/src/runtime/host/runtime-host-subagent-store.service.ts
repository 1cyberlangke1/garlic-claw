import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PluginCallContext,
  PluginSubagentDetail,
  PluginSubagentOverview,
  PluginSubagentRequest,
  PluginSubagentSummary,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { cloneJsonValue } from './runtime-host-values';

export type RuntimeSubagentRecord = PluginSubagentDetail & {
  id: string;
  visibility: 'background' | 'inline';
  writeBackConversationRevision?: string;
};

@Injectable()
export class RuntimeHostSubagentStoreService {
  private readonly subagents: Map<string, RuntimeSubagentRecord[]>;
  private readonly storagePath = process.env.GARLIC_CLAW_SUBAGENTS_PATH
    ?? path.join(process.cwd(), 'tmp', 'subagents.server.json');
  private subagentSequence = 0;

  constructor() {
    this.subagents = this.loadSubagents();
  }

  getSubagent(pluginId: string, sessionId: string): PluginSubagentDetail {
    return toSubagentDetail(this.requireLatestSubagentBySession(sessionId, pluginId));
  }

  getSubagentOrThrow(sessionId: string): PluginSubagentDetail {
    return toSubagentDetail(this.requireLatestSubagentBySession(sessionId));
  }

  readSubagent(subagentId: string, pluginId?: string): RuntimeSubagentRecord {
    return cloneJsonValue(this.requireSubagent(subagentId, pluginId)) as RuntimeSubagentRecord;
  }

  listOverview(): PluginSubagentOverview {
    return { subagents: this.summarizeSubagents(this.listSessionProjectionRecords(undefined, 'background'), false) };
  }

  listSubagents(pluginId: string): PluginSubagentSummary[] {
    return this.summarizeSubagents(this.listSessionProjectionRecords(pluginId, 'background'), true);
  }

  summarizeSubagent(subagent: RuntimeSubagentRecord): PluginSubagentSummary {
    return toSubagentSummary(subagent);
  }

  listPendingSubagents(pluginId?: string): RuntimeSubagentRecord[] {
    return this.listSubagentRecords(pluginId)
      .filter((subagent) => subagent.status === 'queued' || subagent.status === 'running')
      .map((subagent) => cloneJsonValue(subagent) as RuntimeSubagentRecord);
  }

  createSubagent(input: {
    context: PluginCallContext;
    conversationRevision?: string;
    pluginDisplayName: string | undefined;
    pluginId: string;
    subagentType?: string;
    subagentTypeName?: string;
    request: PluginSubagentRequest;
    requestPreview: string;
    sessionId: string;
    sessionMessageCount: number;
    sessionUpdatedAt: string;
    visibility: 'background' | 'inline';
    writeBackTarget: PluginSubagentSummary['writeBackTarget'] | null;
  }): RuntimeSubagentRecord {
    const now = new Date().toISOString();
    const subagent: RuntimeSubagentRecord = {
      context: cloneJsonValue(input.context),
      ...(input.request.description ? { description: input.request.description } : {}),
      finishedAt: null,
      id: `subagent-${++this.subagentSequence}`,
      modelId: input.request.modelId,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      ...(input.subagentType ? { subagentType: input.subagentType } : {}),
      ...(input.subagentTypeName ? { subagentTypeName: input.subagentTypeName } : {}),
      providerId: input.request.providerId,
      request: input.request,
      requestPreview: input.requestPreview,
      requestedAt: now,
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
      writeBackTarget: input.writeBackTarget ?? undefined,
      ...(input.conversationRevision ? { writeBackConversationRevision: input.conversationRevision } : {}),
      ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
      ...(input.context.userId ? { userId: input.context.userId } : {}),
    };
    const records = this.subagents.get(input.pluginId) ?? [];
    records.push(subagent);
    this.subagents.set(input.pluginId, records);
    this.saveSubagents();
    return cloneJsonValue(subagent) as RuntimeSubagentRecord;
  }

  updateSubagent(
    pluginId: string,
    subagentId: string,
    mutate: (subagent: RuntimeSubagentRecord, now: string) => void,
  ): void {
    const now = new Date().toISOString();
    mutate(this.requireSubagent(subagentId, pluginId), now);
    this.saveSubagents();
  }

  private listSubagentRecords(
    pluginId?: string,
    visibility?: RuntimeSubagentRecord['visibility'],
  ): RuntimeSubagentRecord[] {
    const records = pluginId ? (this.subagents.get(pluginId) ?? []) : [...this.subagents.values()].flat();
    return visibility ? records.filter((subagent) => subagent.visibility === visibility) : records;
  }

  private listSessionProjectionRecords(
    pluginId?: string,
    visibility?: RuntimeSubagentRecord['visibility'],
  ): RuntimeSubagentRecord[] {
    const latestBySession = new Map<string, RuntimeSubagentRecord>();
    for (const subagent of this.listSubagentRecords(pluginId, visibility)) {
      const current = latestBySession.get(subagent.sessionId);
      if (!current) {
        latestBySession.set(subagent.sessionId, subagent);
        continue;
      }
      if (current.requestedAt.localeCompare(subagent.requestedAt) < 0) {
        latestBySession.set(subagent.sessionId, subagent);
        continue;
      }
      if (current.requestedAt === subagent.requestedAt && current.id.localeCompare(subagent.id) < 0) {
        latestBySession.set(subagent.sessionId, subagent);
      }
    }
    return [...latestBySession.values()];
  }

  private summarizeSubagents(subagents: RuntimeSubagentRecord[], ascending: boolean): PluginSubagentSummary[] {
    const direction = ascending ? 1 : -1;
    return subagents
      .slice()
      .sort((left, right) => direction * left.requestedAt.localeCompare(right.requestedAt))
      .map(summarizeSubagent);
  }

  private loadSubagents(): Map<string, RuntimeSubagentRecord[]> {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {
        return new Map<string, RuntimeSubagentRecord[]>();
      }
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as {
        subagentSequence?: number;
        subagents?: Record<string, RuntimeSubagentRecord[]>;
      };
      this.subagentSequence = typeof parsed.subagentSequence === 'number' ? parsed.subagentSequence : 0;
      return new Map<string, RuntimeSubagentRecord[]>(
        Object.entries(parsed.subagents ?? {}).map(([pluginId, records]) => [
          pluginId,
          Array.isArray(records) ? records.map(normalizeSubagentRecord) : [],
        ]),
      );
    } catch {
      return new Map<string, RuntimeSubagentRecord[]>();
    }
  }

  private requireSubagent(subagentId: string, pluginId?: string): RuntimeSubagentRecord {
    const subagent = this.listSubagentRecords(pluginId).find((entry) => entry.id === subagentId);
    if (subagent) {
      return subagent;
    }
    throw new NotFoundException(`Subagent not found: ${subagentId}`);
  }

  private requireLatestSubagentBySession(sessionId: string, pluginId?: string): RuntimeSubagentRecord {
    const subagent = this.listSessionProjectionRecords(pluginId).find((entry) => entry.sessionId === sessionId);
    if (subagent) {
      return subagent;
    }
    throw new NotFoundException(`Subagent session not found: ${sessionId}`);
  }

  private saveSubagents(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(
      this.storagePath,
      JSON.stringify({ subagentSequence: this.subagentSequence, subagents: Object.fromEntries(this.subagents) }, null, 2),
      'utf-8',
    );
  }
}

function summarizeSubagent(subagent: RuntimeSubagentRecord): PluginSubagentSummary {
  const { context: _context, id: _id, request: _request, result: _result, visibility: _visibility, ...summary } = cloneJsonValue(subagent);
  return summary;
}

function toSubagentSummary(subagent: RuntimeSubagentRecord): PluginSubagentSummary {
  return summarizeSubagent(subagent);
}

function toSubagentDetail(subagent: RuntimeSubagentRecord): PluginSubagentDetail {
  const { id: _id, visibility: _visibility, ...detail } = cloneJsonValue(subagent);
  return detail;
}

function normalizeSubagentRecord(subagent: RuntimeSubagentRecord): RuntimeSubagentRecord {
  return {
    ...subagent,
    sessionId: typeof subagent.sessionId === 'string' && subagent.sessionId.trim().length > 0 ? subagent.sessionId : subagent.id,
    sessionMessageCount: typeof subagent.sessionMessageCount === 'number' ? subagent.sessionMessageCount : subagent.request.messages.length,
    sessionUpdatedAt: typeof subagent.sessionUpdatedAt === 'string' && subagent.sessionUpdatedAt.trim().length > 0 ? subagent.sessionUpdatedAt : subagent.requestedAt,
    visibility: subagent.visibility === 'inline' ? 'inline' : 'background',
  };
}
