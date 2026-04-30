import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, PluginCallContext, PluginLlmMessage, PluginSubagentExecutionResult } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { resolveServerStatePath } from '../server-workspace-paths';
import { cloneJsonValue } from './runtime-host-values';

export interface RuntimeSubagentSessionRecord {
  id: string;
  pluginId: string;
  pluginDisplayName?: string;
  childConversationId?: string;
  description?: string;
  subagentType?: string;
  subagentTypeName?: string;
  providerId?: string;
  modelId?: string;
  system?: string;
  toolNames?: string[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  conversationId?: string;
  userId?: string;
  lastSubagentId?: string;
  createdAt: string;
  updatedAt: string;
  messages: PluginLlmMessage[];
  removedAt?: string;
}

@Injectable()
export class RuntimeHostSubagentSessionStoreService {
  private readonly sessions = new Map<string, RuntimeSubagentSessionRecord>();
  private readonly storagePath = process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH
    ?? resolveServerStatePath('subagent-sessions.server.json');
  private sessionSequence = 0;

  constructor() {
    const stored = readSessionStorage(this.storagePath);
    this.sessionSequence = stored.sessionSequence;
    this.sessions = stored.sessions;
  }

  createSession(input: {
    context: PluginCallContext;
    childConversationId?: string;
    description?: string;
    messages: PluginLlmMessage[];
    modelId?: string;
    pluginDisplayName?: string;
    pluginId: string;
    subagentType?: string;
    subagentTypeName?: string;
    providerId?: string;
    system?: string;
    toolNames?: string[];
    variant?: string;
    providerOptions?: JsonObject;
    headers?: Record<string, string>;
    maxOutputTokens?: number;
    subagentId?: string;
  }): RuntimeSubagentSessionRecord {
    const now = new Date().toISOString();
    const session: RuntimeSubagentSessionRecord = {
      createdAt: now,
      id: `subagent-session-${++this.sessionSequence}`,
      messages: cloneJsonValue(input.messages),
      pluginId: input.pluginId,
      updatedAt: now,
      ...readSessionFields(input),
    };
    this.sessions.set(session.id, session);
    this.saveSessions();
    return cloneJsonValue(session);
  }

  findSession(pluginId: string, sessionId: string): RuntimeSubagentSessionRecord | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.pluginId !== pluginId || session.removedAt) {
      return null;
    }
    return cloneJsonValue(session);
  }

  getSession(pluginId: string, sessionId: string): RuntimeSubagentSessionRecord { return cloneJsonValue(this.requireSession(sessionId, pluginId)); }
  getSessionOrThrow(sessionId: string): RuntimeSubagentSessionRecord { return cloneJsonValue(this.requireSession(sessionId)); }
  readStoredSession(pluginId: string, sessionId: string): RuntimeSubagentSessionRecord { return cloneJsonValue(this.requireSession(sessionId, pluginId, true)); }

  countConversationSessions(conversationId: string): number {
    return [...this.sessions.values()].filter((session) => session.conversationId === conversationId && !session.removedAt).length;
  }

  removeSession(pluginId: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.pluginId !== pluginId || session.removedAt) {
      return false;
    }
    session.removedAt = session.updatedAt = new Date().toISOString();
    this.saveSessions();
    return true;
  }

  updateSession(pluginId: string, sessionId: string, mutate: (session: RuntimeSubagentSessionRecord, now: string) => void): RuntimeSubagentSessionRecord {
    const now = new Date().toISOString();
    const session = this.requireSession(sessionId, pluginId, true);
    mutate(session, now);
    session.updatedAt = now;
    this.saveSessions();
    return cloneJsonValue(session);
  }

  appendAssistantMessage(pluginId: string, sessionId: string, result: PluginSubagentExecutionResult): RuntimeSubagentSessionRecord {
    return this.updateSession(pluginId, sessionId, (session) => {
      session.messages = [...session.messages, { content: result.message.content, role: 'assistant' }];
      session.providerId = result.providerId;
      session.modelId = result.modelId;
    });
  }

  private requireSession(sessionId: string, pluginId?: string, includeRemoved = false): RuntimeSubagentSessionRecord {
    const session = this.sessions.get(sessionId);
    if (session && (!pluginId || session.pluginId === pluginId) && (includeRemoved || !session.removedAt)) {
      return session;
    }
    throw new NotFoundException(`Subagent session not found: ${sessionId}`);
  }

  private saveSessions(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({
      sessionSequence: this.sessionSequence,
      sessions: Object.fromEntries(this.sessions),
    }, null, 2), 'utf-8');
  }
}

function readSessionStorage(storagePath: string): { sessionSequence: number; sessions: Map<string, RuntimeSubagentSessionRecord> } {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) {return { sessionSequence: 0, sessions: new Map<string, RuntimeSubagentSessionRecord>() };}
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as { sessionSequence?: number; sessions?: Record<string, RuntimeSubagentSessionRecord> };
    return { sessionSequence: typeof parsed.sessionSequence === 'number' ? parsed.sessionSequence : 0, sessions: new Map(Object.entries(parsed.sessions ?? {}).map(([sessionId, session]) => [sessionId, normalizeSessionRecord(session)])) };
  } catch {
    return { sessionSequence: 0, sessions: new Map<string, RuntimeSubagentSessionRecord>() };
  }
}

function readSessionFields(input: {
  context: PluginCallContext;
  childConversationId?: string;
  description?: string;
  modelId?: string;
  pluginDisplayName?: string;
  providerId?: string;
  subagentId?: string;
  subagentType?: string;
  subagentTypeName?: string;
  system?: string;
  toolNames?: string[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
}): Partial<RuntimeSubagentSessionRecord> {
  return {
    ...(input.childConversationId ? { childConversationId: input.childConversationId } : {}),
    ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
    ...(input.context.userId ? { userId: input.context.userId } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.pluginDisplayName ? { pluginDisplayName: input.pluginDisplayName } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.subagentId ? { lastSubagentId: input.subagentId } : {}),
    ...(input.subagentType ? { subagentType: input.subagentType } : {}),
    ...(input.subagentTypeName ? { subagentTypeName: input.subagentTypeName } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: cloneJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: cloneJsonValue(input.providerOptions) } : {}),
    ...(input.headers ? { headers: cloneJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number' ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };
}
function normalizeSessionRecord(session: RuntimeSubagentSessionRecord): RuntimeSubagentSessionRecord {
  return {
    ...session,
    ...(typeof session.childConversationId === 'string' && session.childConversationId.trim().length > 0 ? { childConversationId: session.childConversationId } : {}),
    ...(typeof session.removedAt === 'string' && session.removedAt.trim().length > 0 ? { removedAt: session.removedAt } : {}),
  };
}
