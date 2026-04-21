import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, PluginCallContext, PluginLlmMessage, PluginSubagentExecutionResult } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { cloneJsonValue } from './runtime-host-values';

export interface RuntimeSubagentSessionRecord {
  id: string;
  pluginId: string;
  pluginDisplayName?: string;
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
}

@Injectable()
export class RuntimeHostSubagentSessionStoreService {
  private readonly sessions: Map<string, RuntimeSubagentSessionRecord>;
  private readonly storagePath = process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH
    ?? path.join(process.cwd(), 'tmp', 'subagent-sessions.server.json');
  private sessionSequence = 0;

  constructor() {
    this.sessions = this.loadSessions();
  }

  createSession(input: {
    context: PluginCallContext;
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
      modelId: input.modelId,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      providerId: input.providerId,
      ...(input.system ? { system: input.system } : {}),
      ...(input.toolNames ? { toolNames: cloneJsonValue(input.toolNames) } : {}),
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.providerOptions ? { providerOptions: cloneJsonValue(input.providerOptions) } : {}),
      ...(input.headers ? { headers: cloneJsonValue(input.headers) } : {}),
      ...(typeof input.maxOutputTokens === 'number' ? { maxOutputTokens: input.maxOutputTokens } : {}),
      updatedAt: now,
      ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
      ...(input.context.userId ? { userId: input.context.userId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.subagentType ? { subagentType: input.subagentType } : {}),
      ...(input.subagentTypeName ? { subagentTypeName: input.subagentTypeName } : {}),
      ...(input.subagentId ? { lastSubagentId: input.subagentId } : {}),
    };
    this.sessions.set(session.id, session);
    this.saveSessions();
    return cloneJsonValue(session);
  }

  getSession(pluginId: string, sessionId: string): RuntimeSubagentSessionRecord {
    return cloneJsonValue(this.requireSession(sessionId, pluginId));
  }

  getSessionOrThrow(sessionId: string): RuntimeSubagentSessionRecord {
    return cloneJsonValue(this.requireSession(sessionId));
  }

  updateSession(
    pluginId: string,
    sessionId: string,
    mutate: (session: RuntimeSubagentSessionRecord, now: string) => void,
  ): RuntimeSubagentSessionRecord {
    const now = new Date().toISOString();
    const session = this.requireSession(sessionId, pluginId);
    mutate(session, now);
    session.updatedAt = now;
    this.saveSessions();
    return cloneJsonValue(session);
  }

  appendAssistantMessage(
    pluginId: string,
    sessionId: string,
    result: PluginSubagentExecutionResult,
  ): RuntimeSubagentSessionRecord {
    return this.updateSession(pluginId, sessionId, (session) => {
      session.messages = [
        ...session.messages,
        {
          content: result.message.content,
          role: 'assistant',
        },
      ];
      session.providerId = result.providerId;
      session.modelId = result.modelId;
    });
  }

  private loadSessions(): Map<string, RuntimeSubagentSessionRecord> {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {
        return new Map<string, RuntimeSubagentSessionRecord>();
      }
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as {
        sessionSequence?: number;
        sessions?: Record<string, RuntimeSubagentSessionRecord>;
      };
      this.sessionSequence = typeof parsed.sessionSequence === 'number' ? parsed.sessionSequence : 0;
      return new Map<string, RuntimeSubagentSessionRecord>(Object.entries(parsed.sessions ?? {}));
    } catch {
      return new Map<string, RuntimeSubagentSessionRecord>();
    }
  }

  private requireSession(sessionId: string, pluginId?: string): RuntimeSubagentSessionRecord {
    const session = this.sessions.get(sessionId);
    if (session && (!pluginId || session.pluginId === pluginId)) {
      return session;
    }
    throw new NotFoundException(`Subagent session not found: ${sessionId}`);
  }

  private saveSessions(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(
      this.storagePath,
      JSON.stringify({
        sessionSequence: this.sessionSequence,
        sessions: Object.fromEntries(this.sessions),
      }, null, 2),
      'utf-8',
    );
  }
}
