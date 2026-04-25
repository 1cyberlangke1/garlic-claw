import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ChatMessageMetadata,
  ChatMessagePart,
  ConversationHostServices,
  ConversationTodoItem,
  JsonObject,
  JsonValue,
  PluginCallContext,
} from '@garlic-claw/shared';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { listDispatchableHookPluginIds } from '../kernel/runtime-plugin-hook-governance';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readJsonObject, readOptionalBoolean, readPositiveInteger, requireContextField } from './runtime-host-values';

export interface RuntimeConversationRecord { activePersonaId?: string; createdAt: string; hostServices: ConversationHostServices; id: string; messages: JsonObject[]; revision: string; revisionVersion: number; runtimePermissionApprovals?: string[]; title: string; updatedAt: string; userId: string; }
interface RuntimeConversationSessionRecord { captureHistory: boolean; conversationId: string; expiresAt: string; historyMessages: JsonObject[]; lastMatchedAt: string | null; metadata?: JsonObject; pluginId: string; startedAt: string; timeoutMs: number; }
interface RuntimeConversationStoragePayload { conversations?: Record<string, RuntimeConversationRecord>; todos?: Record<string, ConversationTodoItem[]>; }
type RuntimeConversationRecordView = 'detail' | 'history' | 'overview' | 'summary';
const DEFAULT_HOST_SERVICES: ConversationHostServices = { llmEnabled: true, sessionEnabled: true, ttsEnabled: true };

@Injectable()
export class RuntimeHostConversationRecordService {
  private readonly conversationSessions = new Map<string, RuntimeConversationSessionRecord>();
  private readonly storagePath = resolveConversationStoragePath();
  private readonly conversations: Map<string, RuntimeConversationRecord>;
  private readonly conversationTodos: Map<string, ConversationTodoItem[]>;

  constructor(
    @Optional() private readonly runtimeHostPluginDispatchService?: RuntimeHostPluginDispatchService,
    @Optional() private readonly runtimeSessionEnvironmentService?: RuntimeSessionEnvironmentService,
  ) {
    const stored = this.readStoredConversations();
    this.conversations = stored.records;
    this.conversationTodos = stored.todos;
    if (stored.migrated) {this.persistConversations();}
  }

  createConversation(input: { title?: string; userId?: string }): JsonValue {
    const timestamp = new Date().toISOString();
    const conversationId = randomUUID();
    const conversation: RuntimeConversationRecord = { createdAt: timestamp, hostServices: { ...DEFAULT_HOST_SERVICES }, id: conversationId, messages: [], revision: `${conversationId}:${timestamp}:${Math.random().toString(36).slice(2)}:0`, revisionVersion: 0, runtimePermissionApprovals: [], title: input.title?.trim() || 'New Chat', updatedAt: timestamp, userId: input.userId ?? SINGLE_USER_ID };
    this.conversations.set(conversation.id, conversation);
    this.persistConversations();
    const overview = readConversationRecordValue(conversation, 'overview') as JsonObject;
    void this.broadcastConversationCreated(overview, conversation.userId);
    return overview;
  }

  deleteConversation(conversationId: string, userId?: string): JsonValue {
    this.requireConversation(conversationId, userId);
    this.conversations.delete(conversationId);
    this.conversationTodos.delete(conversationId);
    this.runtimeSessionEnvironmentService?.deleteSessionEnvironment(conversationId);
    this.persistConversations();
    return { message: 'Conversation deleted' };
  }

  getConversationSession(pluginId: string, context: PluginCallContext): JsonValue { return serializeConversationSession(this.readConversationSession(pluginId, readConversationId(context))); }
  getConversation(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'detail'); }
  listConversations(userId?: string): JsonValue { return [...this.conversations.values()].filter((conversation) => !userId || conversation.userId === userId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map((conversation) => readConversationRecordValue(conversation, 'overview')); }
  listPluginConversationSessions(pluginId: string): JsonValue { return [...this.conversationSessions.values()].filter((session) => session.pluginId === pluginId).sort((left, right) => left.startedAt.localeCompare(right.startedAt)).map(serializeConversationSession); }
  readConversationHostServices(conversationId: string, userId?: string): JsonValue { return asJsonValue(this.requireConversation(conversationId, userId).hostServices); }
  readConversationRevision(conversationId: string): string | null { return this.conversations.get(conversationId)?.revision ?? null; }
  finishPluginConversationSession(pluginId: string, conversationId: string): boolean { return this.conversationSessions.delete(readConversationSessionKey(pluginId, conversationId)); }
  readConversationSummary(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'summary'); }
  readRuntimePermissionApprovals(conversationId: string, userId?: string): string[] { return [...(this.requireConversation(conversationId, userId).runtimePermissionApprovals ?? [])]; }
  readSessionTodo(sessionId: string, userId?: string): JsonValue { this.requireConversation(sessionId, userId); return asJsonValue((this.conversationTodos.get(sessionId) ?? []).map((item) => cloneJsonValue(item))); }
  readConversationHistory(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'history'); }
  readCurrentMessageTarget(conversationId: string, userId?: string): JsonValue { const conversation = this.requireConversation(conversationId, userId); return { id: conversation.id, label: conversation.title, type: 'conversation' }; }

  keepConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const current = this.readConversationSession(pluginId, readConversationId(context));
    if (!current) {return null;}
    const timeoutMs = this.readSessionTimeoutMs(params), resetTimeout = readOptionalBoolean(params, 'resetTimeout') ?? true, baseTime = resetTimeout ? Date.now() : Date.parse(current.expiresAt);
    return this.saveConversationSession({ ...current, expiresAt: new Date(baseTime + timeoutMs).toISOString(), timeoutMs: resetTimeout ? timeoutMs : current.timeoutMs + timeoutMs });
  }

  startConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const conversation = this.requireConversation(readConversationId(context)), startedAt = new Date().toISOString(), timeoutMs = this.readSessionTimeoutMs(params), captureHistory = readOptionalBoolean(params, 'captureHistory') ?? false, metadata = readJsonObject(params.metadata);
    return this.saveConversationSession({ captureHistory, conversationId: conversation.id, expiresAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(), historyMessages: captureHistory ? conversation.messages.map((message) => cloneJsonValue(message)) : [], lastMatchedAt: null, ...(metadata ? { metadata } : {}), pluginId, startedAt, timeoutMs });
  }

  previewConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const messages = params.messages === undefined ? this.requireConversation(conversationId, userId).messages.map((message) => cloneJsonValue(message)) : readConversationHistoryMessages(params.messages);
    const textBytes = Buffer.byteLength(messages.map(readConversationHistoryMessageText).filter(Boolean).join('\n'), 'utf8');
    return asJsonValue({ estimatedTokens: Math.ceil(textBytes / 4), messageCount: messages.length, textBytes });
  }

  replaceConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const expectedRevision = readRequiredConversationHistoryString(params, 'expectedRevision');
    const nextMessages = readConversationHistoryMessages(params.messages);
    const current = this.requireConversation(conversationId, userId);
    assertConversationRevision(current, expectedRevision);
    if (JSON.stringify(current.messages) === JSON.stringify(nextMessages)) {
      return asJsonValue({ ...(readConversationRecordValue(current, 'history') as JsonObject), changed: false });
    }
    const updated = this.updateConversationRecord(conversationId, userId, (conversation) => { conversation.messages = cloneJsonValue(nextMessages); return conversation; });
    return asJsonValue({ ...(readConversationRecordValue(updated, 'history') as JsonObject), changed: true });
  }

  replaceSessionTodo(sessionId: string, todos: ConversationTodoItem[], userId?: string): JsonValue {
    this.requireConversation(sessionId, userId);
    this.conversationTodos.set(sessionId, todos.map((item) => cloneJsonValue(item)));
    this.persistConversations();
    return asJsonValue(todos.map((item) => cloneJsonValue(item)));
  }

  rememberConversationActivePersona(conversationId: string, activePersonaId: string, userId?: string): void {
    this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.activePersonaId = activePersonaId;
      return null;
    });
  }

  replaceMessages(conversationId: string, messages: JsonObject[], userId?: string): RuntimeConversationRecord {
    return this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.messages = cloneJsonValue(messages);
      return conversation;
    });
  }

  requireConversation(conversationId: string, userId?: string): RuntimeConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {throw new NotFoundException(`Conversation not found: ${conversationId}`);}
    if (userId && conversation.userId !== userId) {throw new ForbiddenException('Not your conversation');}
    return conversation;
  }

  writeConversationHostServices(conversationId: string, patch: Partial<ConversationHostServices>, userId?: string): JsonValue {
    return asJsonValue(this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.hostServices = { ...conversation.hostServices, ...(typeof patch.sessionEnabled === 'boolean' ? { sessionEnabled: patch.sessionEnabled } : {}), ...(typeof patch.llmEnabled === 'boolean' ? { llmEnabled: patch.llmEnabled } : {}), ...(typeof patch.ttsEnabled === 'boolean' ? { ttsEnabled: patch.ttsEnabled } : {}) };
      return conversation.hostServices;
    }));
  }

  writeConversationTitle(conversationId: string, title: string, userId?: string): JsonValue {
    return readConversationRecordValue(this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.title = title;
      return conversation;
    }), 'summary');
  }

  rememberRuntimePermissionApproval(conversationId: string, approvalKey: string, userId?: string): string[] {
    return [...(this.updateConversationRecord(conversationId, userId, (conversation) => {
      const approvals = new Set(conversation.runtimePermissionApprovals ?? []); approvals.add(approvalKey); conversation.runtimePermissionApprovals = [...approvals].sort((left, right) => left.localeCompare(right));
      return conversation.runtimePermissionApprovals ?? [];
    }, { bumpRevision: false }) ?? [])];
  }

  private updateConversationRecord<T>(
    conversationId: string,
    userId: string | undefined,
    mutate: (conversation: RuntimeConversationRecord) => T,
    options?: { bumpRevision?: boolean },
  ): T {
    const conversation = this.requireConversation(conversationId, userId);
    const result = mutate(conversation);
    if (options?.bumpRevision !== false) {
      conversation.updatedAt = new Date().toISOString();
      conversation.revisionVersion += 1;
      conversation.revision = `${readRevisionSeed(conversation.revision)}:${conversation.revisionVersion}`;
    }
    this.persistConversations();
    return result;
  }

  private readConversationSession(pluginId: string, conversationId: string): RuntimeConversationSessionRecord | null {
    const key = readConversationSessionKey(pluginId, conversationId);
    const session = this.conversationSessions.get(key);
    if (!session) {return null;}
    if (Date.parse(session.expiresAt) > Date.now()) {return session;}
    this.conversationSessions.delete(key);
    return null;
  }

  private saveConversationSession(session: RuntimeConversationSessionRecord): JsonValue {
    this.conversationSessions.set(readConversationSessionKey(session.pluginId, session.conversationId), session);
    return serializeConversationSession(session);
  }

  private readSessionTimeoutMs(params: JsonObject): number {
    const timeoutMs = readPositiveInteger(params, 'timeoutMs');
    if (timeoutMs) {return timeoutMs;}
    throw new BadRequestException('timeoutMs must be a positive integer');
  }

  private persistConversations(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const conversations = Object.fromEntries([...this.conversations.entries()].map(([id, record]) => [id, cloneJsonValue(record)]));
    const todos = Object.fromEntries([...this.conversationTodos.entries()].map(([id, items]) => [id, cloneJsonValue(items)]));
    fs.writeFileSync(this.storagePath, JSON.stringify({ conversations, ...(Object.keys(todos).length > 0 ? { todos } : {}) }, null, 2), 'utf-8');
  }

  private readStoredConversations(): { migrated: boolean; records: Map<string, RuntimeConversationRecord>; todos: Map<string, ConversationTodoItem[]> } {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return { migrated: false, records: new Map(), todos: new Map() };}
      const payload = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as RuntimeConversationStoragePayload;
      const entries = Object.entries(payload.conversations ?? {});
      const records = new Map(entries.flatMap(([id, record]) => record.userId === SINGLE_USER_ID ? [[id, cloneJsonValue(record)]] : []));
      const todos = new Map(Object.entries(payload.todos ?? {}).flatMap(([conversationId, items]) => records.has(conversationId) && Array.isArray(items) ? [[conversationId, cloneJsonValue(items)]] : []));
      return { migrated: records.size !== entries.length, records, todos };
    } catch {
      return { migrated: false, records: new Map(), todos: new Map() };
    }
  }

  private async broadcastConversationCreated(conversation: JsonObject, userId: string): Promise<void> {
    const kernel = this.runtimeHostPluginDispatchService;
    if (!kernel) {return;}
    const context = { conversationId: String(conversation.id), source: 'http-route' as const, userId };
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:created', kernel })) {
      await kernel.invokeHook({ context, hookName: 'conversation:created', payload: asJsonValue({ context, conversation }), pluginId });
    }
  }
}

function readConversationId(context: PluginCallContext): string { return requireContextField(context, 'conversationId'); }
function readRevisionSeed(revision: string): string { const lastSeparator = revision.lastIndexOf(':'); return lastSeparator > 0 ? revision.slice(0, lastSeparator) : revision; }
function readConversationSessionKey(pluginId: string, conversationId: string): string { return `${pluginId}:${conversationId}`; }
function assertConversationRevision(conversation: RuntimeConversationRecord, expectedRevision: string): void {
  if (conversation.revision !== expectedRevision) {throw new ConflictException(`Conversation revision mismatch: expected ${expectedRevision}, got ${conversation.revision}`);}
}

function readConversationRecordValue(conversation: RuntimeConversationRecord, view: RuntimeConversationRecordView): JsonValue {
  const summary = { createdAt: conversation.createdAt, id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt };
  if (view === 'history') {return { conversationId: conversation.id, revision: conversation.revision, messages: conversation.messages.map(serializeConversationHistoryMessage) };}
  if (view === 'summary') {return { ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}), ...summary };}
  const counted = { _count: { messages: conversation.messages.length }, ...summary };
  return view === 'overview' ? counted : asJsonValue({ ...counted, messages: conversation.messages.map(serializeConversationMessage) });
}

function resolveConversationStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATIONS_PATH) {return process.env.GARLIC_CLAW_CONVERSATIONS_PATH;}
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `conversations.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);}
  return path.join(process.cwd(), 'tmp', 'conversations.server.json');
}

function serializeConversationSession(session: RuntimeConversationSessionRecord | null): JsonValue {
  return session ? { ...(session.metadata ? { metadata: cloneJsonValue(session.metadata) } : {}), captureHistory: session.captureHistory, conversationId: session.conversationId, expiresAt: session.expiresAt, historyMessages: session.historyMessages.map((message) => cloneJsonValue(message)), lastMatchedAt: session.lastMatchedAt, pluginId: session.pluginId, startedAt: session.startedAt, timeoutMs: session.timeoutMs } : null;
}

export function serializeConversationMessage(message: JsonObject): JsonObject {
  return {
    content: typeof message.content === 'string' ? message.content : null,
    createdAt: String(message.createdAt),
    error: typeof message.error === 'string' ? message.error : null,
    id: String(message.id),
    metadataJson: typeof message.metadataJson === 'string' ? message.metadataJson : null,
    model: typeof message.model === 'string' ? message.model : null,
    partsJson: Array.isArray(message.parts) && message.parts.length > 0 ? JSON.stringify(message.parts) : null,
    provider: typeof message.provider === 'string' ? message.provider : null,
    role: String(message.role),
    status: message.status,
    toolCalls: Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? JSON.stringify(message.toolCalls) : null,
    toolResults: Array.isArray(message.toolResults) && message.toolResults.length > 0 ? JSON.stringify(message.toolResults) : null,
    updatedAt: String(message.updatedAt),
  };
}

function serializeConversationHistoryMessage(message: JsonObject): JsonObject {
  const metadata = readStoredConversationMetadata(message.metadataJson);
  return asJsonValue({
    content: typeof message.content === 'string' ? message.content : null,
    createdAt: String(message.createdAt),
    ...(typeof message.error === 'string' ? { error: message.error } : {}),
    id: String(message.id),
    ...(metadata ? { metadata } : {}),
    ...(typeof message.model === 'string' ? { model: message.model } : {}),
    parts: Array.isArray(message.parts) ? cloneJsonValue(message.parts) : [],
    ...(typeof message.provider === 'string' ? { provider: message.provider } : {}),
    role: String(message.role),
    status: typeof message.status === 'string' ? message.status : 'completed',
    ...(Array.isArray(message.toolCalls) ? { toolCalls: cloneJsonValue(message.toolCalls) } : {}),
    ...(Array.isArray(message.toolResults) ? { toolResults: cloneJsonValue(message.toolResults) } : {}),
    updatedAt: String(message.updatedAt),
  }) as JsonObject;
}

function readConversationHistoryMessages(value: unknown): JsonObject[] {
  return readRequiredConversationHistoryArray(value, 'messages', (entry, index) => normalizeConversationHistoryMessage(entry, index));
}

function normalizeConversationHistoryMessage(value: unknown, index: number): JsonObject {
  const label = `messages[${index}]`;
  const object = readRequiredConversationHistoryObject(value, `${label} must be an object`);
  const metadata = readConversationHistoryMetadata(object.metadata, index);
  const toolCalls = readOptionalConversationHistoryArray(object.toolCalls, `${label}.toolCalls`, (entry) => cloneJsonValue(entry) as JsonValue);
  const toolResults = readOptionalConversationHistoryArray(object.toolResults, `${label}.toolResults`, (entry) => cloneJsonValue(entry) as JsonValue);
  return {
    content: readOptionalConversationHistoryString(object.content, `${label}.content`) ?? '',
    createdAt: readConversationHistoryTimestamp(object.createdAt),
    ...(typeof object.error === 'string' ? { error: object.error } : {}),
    id: readRequiredConversationHistoryString(object, 'id', index),
    ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    ...(typeof object.model === 'string' ? { model: object.model } : {}),
    parts: asJsonValue(readOptionalConversationHistoryArray(object.parts, `${label}.parts`, (entry, partIndex) => readConversationHistoryPart(entry, index, partIndex)) ?? []),
    ...(typeof object.provider === 'string' ? { provider: object.provider } : {}),
    role: readRequiredConversationHistoryString(object, 'role', index),
    status: readOptionalConversationHistoryStatus(object.status, `${label}.status`) ?? 'completed',
    ...(toolCalls ? { toolCalls: asJsonValue(toolCalls) } : {}),
    ...(toolResults ? { toolResults: asJsonValue(toolResults) } : {}),
    updatedAt: readConversationHistoryTimestamp(object.updatedAt),
  };
}

function readRequiredConversationHistoryString(params: JsonObject, key: string, index?: number): string {
  const value = params[key];
  if (typeof value === 'string' && value.trim()) {return value.trim();}
  if (index === undefined) {throw new BadRequestException(`${key} is required`);}
  throw new BadRequestException(`messages[${index}].${key} is required`);
}

function readOptionalConversationHistoryString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {return null;}
  if (typeof value === 'string') {return value;}
  throw new BadRequestException(`${label} must be string or null`);
}

function readOptionalConversationHistoryStatus(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {return null;}
  if (value === 'pending' || value === 'streaming' || value === 'completed' || value === 'stopped' || value === 'error') {return value;}
  throw new BadRequestException(`${label} is invalid`);
}

function readConversationHistoryTimestamp(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : new Date().toISOString();
}

function readRequiredConversationHistoryObject(value: unknown, errorMessage: string): JsonObject {
  const object = readJsonObject(value);
  if (object) {return object;}
  throw new BadRequestException(errorMessage);
}

function readRequiredConversationHistoryArray<T>(value: unknown, label: string, readEntry: (entry: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) {throw new BadRequestException(`${label} must be an array`);}
  return value.map((entry, index) => readEntry(entry, index));
}

function readOptionalConversationHistoryArray<T>(value: unknown, label: string, readEntry: (entry: unknown, index: number) => T): T[] | null {
  if (value === undefined || value === null) {return null;}
  return readRequiredConversationHistoryArray(value, label, readEntry);
}

function readConversationHistoryPart(value: unknown, messageIndex: number, partIndex: number): ChatMessagePart {
  const object = readRequiredConversationHistoryObject(value, `messages[${messageIndex}].parts[${partIndex}] is invalid`);
  if (object.type === 'text' && typeof object.text === 'string') {return { text: object.text, type: 'text' };}
  if (object.type === 'image' && typeof object.image === 'string') {
    return { image: object.image, ...(typeof object.mimeType === 'string' ? { mimeType: object.mimeType } : {}), type: 'image' };
  }
  throw new BadRequestException(`messages[${messageIndex}].parts[${partIndex}] is invalid`);
}

function readConversationHistoryMetadata(value: unknown, index: number): ChatMessageMetadata | null {
  if (value === undefined || value === null) {return null;}
  const object = readRequiredConversationHistoryObject(value, `messages[${index}].metadata must be an object`);
  const metadata: ChatMessageMetadata = {};
  if (object.visionFallback !== undefined) {metadata.visionFallback = readConversationHistoryVisionFallback(object.visionFallback, index);}
  if (object.customBlocks !== undefined) {metadata.customBlocks = readConversationHistoryCustomBlocks(object.customBlocks, index);}
  if (object.annotations !== undefined) {metadata.annotations = readConversationHistoryAnnotations(object.annotations, index);}
  return metadata;
}

function readConversationHistoryVisionFallback(value: unknown, index: number): NonNullable<ChatMessageMetadata['visionFallback']> {
  const object = readRequiredConversationHistoryObject(value, `messages[${index}].metadata.visionFallback is invalid`);
  if ((object.state !== 'completed' && object.state !== 'transcribing') || !Array.isArray(object.entries)) {
    throw new BadRequestException(`messages[${index}].metadata.visionFallback is invalid`);
  }
  return {
    entries: object.entries.map((entry, entryIndex) => {
      const item = readRequiredConversationHistoryObject(entry, `messages[${index}].metadata.visionFallback.entries[${entryIndex}] is invalid`);
      if (typeof item.text !== 'string' || (item.source !== 'cache' && item.source !== 'generated')) {
        throw new BadRequestException(`messages[${index}].metadata.visionFallback.entries[${entryIndex}] is invalid`);
      }
      return { source: item.source, text: item.text };
    }),
    state: object.state,
  };
}

function readConversationHistoryCustomBlocks(value: unknown, index: number): NonNullable<ChatMessageMetadata['customBlocks']> {
  return readRequiredConversationHistoryArray(value, `messages[${index}].metadata.customBlocks`, (entry, blockIndex) => {
    const object = readRequiredConversationHistoryObject(entry, `messages[${index}].metadata.customBlocks[${blockIndex}] is invalid`);
    if (typeof object.id !== 'string' || typeof object.title !== 'string') {
      throw new BadRequestException(`messages[${index}].metadata.customBlocks[${blockIndex}] is invalid`);
    }
    const source = readConversationHistorySource(object.source);
    const state = object.state === 'done' || object.state === 'streaming' ? object.state : undefined;
    if (object.kind === 'text' && typeof object.text === 'string') {
      return { id: object.id, kind: 'text' as const, ...(source ? { source } : {}), ...(state ? { state } : {}), text: object.text, title: object.title };
    }
    if (object.kind === 'json' && object.data !== undefined) {
      return { data: cloneJsonValue(object.data) as JsonValue, id: object.id, kind: 'json' as const, ...(source ? { source } : {}), ...(state ? { state } : {}), title: object.title };
    }
    throw new BadRequestException(`messages[${index}].metadata.customBlocks[${blockIndex}] is invalid`);
  });
}

function readConversationHistorySource(value: unknown): { key?: string; origin?: string; providerId?: string } | null {
  const object = readJsonObject(value);
  return object ? cloneJsonValue(object) as { key?: string; origin?: string; providerId?: string } : null;
}

function readConversationHistoryAnnotations(value: unknown, index: number): NonNullable<ChatMessageMetadata['annotations']> {
  return readRequiredConversationHistoryArray(value, `messages[${index}].metadata.annotations`, (entry, annotationIndex) => {
    const object = readRequiredConversationHistoryObject(entry, `messages[${index}].metadata.annotations[${annotationIndex}] is invalid`);
    if (typeof object.type !== 'string' || typeof object.owner !== 'string' || typeof object.version !== 'string') {
      throw new BadRequestException(`messages[${index}].metadata.annotations[${annotationIndex}] is invalid`);
    }
    return { ...(object.data !== undefined ? { data: cloneJsonValue(object.data) as JsonValue } : {}), owner: object.owner, type: object.type, version: object.version };
  });
}

function readStoredConversationMetadata(value: unknown): ChatMessageMetadata | null {
  if (typeof value !== 'string' || !value.trim()) {return null;}
  try {
    return JSON.parse(value) as ChatMessageMetadata;
  } catch {
    return null;
  }
}

function readConversationHistoryMessageText(message: JsonObject): string {
  if (message.role === 'display') {return '';}
  const partText = Array.isArray(message.parts)
    ? message.parts.flatMap((part) => {
      const object = readJsonObject(part);
      return object?.type === 'text' && typeof object.text === 'string' ? [object.text] : [];
    }).join('\n')
    : '';
  return [typeof message.role === 'string' ? message.role : '', partText || (typeof message.content === 'string' ? message.content : ''), Array.isArray(message.toolCalls) ? JSON.stringify(message.toolCalls) : '', Array.isArray(message.toolResults) ? JSON.stringify(message.toolResults) : ''].filter(Boolean).join('\n');
}
