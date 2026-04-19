import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ChatMessageMetadata,
  ChatMessagePart,
  ConversationHostServices,
  JsonObject,
  JsonValue,
  PluginCallContext,
} from '@garlic-claw/shared';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readJsonObject, readOptionalBoolean, readPositiveInteger, requireContextField } from './runtime-host-values';
import { listDispatchableHookPluginIds } from '../kernel/runtime-plugin-hook-governance';

export interface RuntimeConversationRecord { activePersonaId?: string; activeSkillIds: string[]; createdAt: string; hostServices: ConversationHostServices; id: string; messages: JsonObject[]; revision: string; revisionVersion: number; title: string; updatedAt: string; userId: string; }
interface RuntimeConversationSessionRecord { captureHistory: boolean; conversationId: string; expiresAt: string; historyMessages: JsonObject[]; lastMatchedAt: string | null; metadata?: JsonObject; pluginId: string; startedAt: string; timeoutMs: number; }

@Injectable()
export class RuntimeHostConversationRecordService {
  private readonly conversationSessions = new Map<string, RuntimeConversationSessionRecord>();
  private readonly storagePath = resolveConversationStoragePath();
  private readonly conversations: Map<string, RuntimeConversationRecord>;

  constructor(@Optional() private readonly runtimeHostPluginDispatchService?: Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>) {
    const loaded = this.loadConversations();
    this.conversations = loaded.records;
    if (loaded.migrated) {this.saveConversations();}
  }

  createConversation(input: { title?: string; userId?: string }): JsonValue {
    const userId = input.userId ?? SINGLE_USER_ID;
    const overview = buildConversationOverview(this.createConversationRecord({ conversationId: randomUUID(), timestamp: new Date().toISOString(), title: input.title?.trim() || 'New Chat', userId }));
    void this.broadcastConversationCreated(overview, userId);
    return overview;
  }

  deleteConversation(conversationId: string, userId?: string): JsonValue {
    this.requireConversation(conversationId, userId);
    this.conversations.delete(conversationId);
    this.saveConversations();
    return { message: 'Conversation deleted' };
  }

  getConversationSession(pluginId: string, context: PluginCallContext): JsonValue { return serializeConversationSession(this.getConversationSessionRecord(pluginId, requireContextField(context, 'conversationId'))); }
  getConversation(conversationId: string, userId?: string): JsonValue { return buildConversationDetail(this.requireConversation(conversationId, userId)); }
  listConversations(userId?: string): JsonValue { return [...this.conversations.values()].filter((conversation) => !userId || conversation.userId === userId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(buildConversationOverview); }
  listPluginConversationSessions(pluginId: string): JsonValue { return [...this.conversationSessions.values()].filter((session) => session.pluginId === pluginId).sort((left, right) => left.startedAt.localeCompare(right.startedAt)).map(serializeConversationSession); }
  readConversationHostServices(conversationId: string, userId?: string): JsonValue { return asJsonValue(this.requireConversation(conversationId, userId).hostServices); }
  readConversationRevision(conversationId: string): string | null { return this.conversations.get(conversationId)?.revision ?? null; }

  readConversationSkillState(conversationId: string, userId?: string): JsonValue { return buildConversationSkillState(this.requireConversation(conversationId, userId)); }

  finishPluginConversationSession(pluginId: string, conversationId: string): boolean { return this.conversationSessions.delete(readConversationSessionKey(pluginId, conversationId)); }

  keepConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const session = this.getConversationSessionRecord(pluginId, requireContextField(context, 'conversationId'));
    if (!session) {return null;}
    const timeoutMs = this.readSessionTimeoutMs(params);
    const resetTimeout = readOptionalBoolean(params, 'resetTimeout') ?? true;
    const nextSession = { ...session, expiresAt: new Date((resetTimeout ? Date.now() : Date.parse(session.expiresAt)) + timeoutMs).toISOString(), timeoutMs: resetTimeout ? timeoutMs : session.timeoutMs + timeoutMs };
    this.conversationSessions.set(readConversationSessionKey(nextSession.pluginId, nextSession.conversationId), nextSession);
    return serializeConversationSession(nextSession);
  }

  startConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const conversation = this.requireConversation(requireContextField(context, 'conversationId'));
    const timeoutMs = this.readSessionTimeoutMs(params);
    const captureHistory = readOptionalBoolean(params, 'captureHistory') ?? false;
    const metadata = readJsonObject(params.metadata);
    const startedAt = new Date().toISOString();
    const session: RuntimeConversationSessionRecord = { captureHistory, conversationId: conversation.id, expiresAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(), historyMessages: captureHistory ? conversation.messages.map((message) => cloneJsonValue(message)) : [], lastMatchedAt: null, pluginId, startedAt, timeoutMs, ...(metadata ? { metadata } : {}) };
    this.conversationSessions.set(readConversationSessionKey(session.pluginId, session.conversationId), session);
    return serializeConversationSession(session);
  }

  readConversationSummary(conversationId: string, userId?: string): JsonValue { return buildConversationSummary(this.requireConversation(conversationId, userId)); }

  readConversationHistory(conversationId: string, userId?: string): JsonValue { return buildConversationHistorySnapshot(this.requireConversation(conversationId, userId)); }

  previewConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const conversation = this.requireConversation(conversationId, userId);
    const messages = params.messages === undefined
      ? conversation.messages.map((message) => cloneJsonValue(message))
      : readConversationHistoryMessagesInput(params.messages);
    return buildConversationHistoryPreview(messages);
  }

  replaceConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const expectedRevision = readRequiredConversationHistoryString(params, 'expectedRevision');
    const nextMessages = readConversationHistoryMessagesInput(params.messages);
    const currentConversation = this.requireConversation(conversationId, userId);
    if (currentConversation.revision !== expectedRevision) {
      throw new ConflictException(`Conversation revision mismatch: expected ${expectedRevision}, got ${currentConversation.revision}`);
    }
    if (JSON.stringify(currentConversation.messages) === JSON.stringify(nextMessages)) {
      return asJsonValue({
        ...buildConversationHistorySnapshot(currentConversation),
        changed: false,
      });
    }
    const updatedConversation = this.mutateConversation(conversationId, (conversation, timestamp) => {
      if (conversation.revision !== expectedRevision) {
        throw new ConflictException(`Conversation revision mismatch: expected ${expectedRevision}, got ${conversation.revision}`);
      }
      conversation.messages = cloneJsonValue(nextMessages);
      this.bumpRevision(conversation, timestamp);
    }, userId);
    return asJsonValue({
      ...buildConversationHistorySnapshot(updatedConversation),
      changed: true,
    });
  }

  readCurrentMessageTarget(conversationId: string, userId?: string): JsonValue { const conversation = this.requireConversation(conversationId, userId); return { id: conversation.id, label: conversation.title, type: 'conversation' }; }

  rememberConversationActivePersona(conversationId: string, activePersonaId: string, userId?: string): void {
    this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.activePersonaId = activePersonaId; this.bumpRevision(conversation, timestamp); }, userId);
  }

  replaceMessages(conversationId: string, messages: JsonObject[], userId?: string): RuntimeConversationRecord {
    return this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.messages = cloneJsonValue(messages); this.bumpRevision(conversation, timestamp); }, userId);
  }

  requireConversation(conversationId: string, userId?: string): RuntimeConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {throw new NotFoundException(`Conversation not found: ${conversationId}`);}
    if (userId && conversation.userId !== userId) {throw new ForbiddenException('Not your conversation');}
    return conversation;
  }

  writeConversationHostServices(conversationId: string, patch: Partial<ConversationHostServices>, userId?: string): JsonValue {
    return asJsonValue(this.mutateConversation(conversationId, (conversation, timestamp) => {
      conversation.hostServices = { ...conversation.hostServices, ...(typeof patch.sessionEnabled === 'boolean' ? { sessionEnabled: patch.sessionEnabled } : {}), ...(typeof patch.llmEnabled === 'boolean' ? { llmEnabled: patch.llmEnabled } : {}), ...(typeof patch.ttsEnabled === 'boolean' ? { ttsEnabled: patch.ttsEnabled } : {}) };
      this.bumpRevision(conversation, timestamp);
    }, userId).hostServices);
  }

  writeConversationSkillState(conversationId: string, activeSkillIds: string[], userId?: string): JsonValue { return buildConversationSkillState(this.mutateConversation(conversationId, (current, timestamp) => { current.activeSkillIds = [...activeSkillIds]; this.bumpRevision(current, timestamp); }, userId)); }

  writeConversationTitle(conversationId: string, title: string, userId?: string): JsonValue {
    return buildConversationSummary(this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.title = title; this.bumpRevision(conversation, timestamp); }, userId));
  }

  private bumpRevision(conversation: RuntimeConversationRecord, timestamp: string): void { conversation.updatedAt = timestamp; conversation.revisionVersion += 1; conversation.revision = `${readRevisionSeed(conversation.revision)}:${conversation.revisionVersion}`; }

  private createConversationRecord(input: { conversationId: string; timestamp: string; title: string; userId: string }): RuntimeConversationRecord {
    const conversation: RuntimeConversationRecord = { activeSkillIds: [], createdAt: input.timestamp, hostServices: { llmEnabled: true, sessionEnabled: true, ttsEnabled: true }, id: input.conversationId, messages: [], revision: `${input.conversationId}:${input.timestamp}:${Math.random().toString(36).slice(2)}:0`, revisionVersion: 0, title: input.title, updatedAt: input.timestamp, userId: input.userId };
    this.conversations.set(conversation.id, conversation);
    this.saveConversations();
    return conversation;
  }

  private mutateConversation(conversationId: string, mutate: (conversation: RuntimeConversationRecord, timestamp: string) => void, userId?: string): RuntimeConversationRecord {
    const conversation = this.requireConversation(conversationId, userId);
    mutate(conversation, new Date().toISOString());
    this.saveConversations();
    return conversation;
  }

  private getConversationSessionRecord(pluginId: string, conversationId: string): RuntimeConversationSessionRecord | null {
    const session = this.conversationSessions.get(readConversationSessionKey(pluginId, conversationId));
    if (!session) {return null;}
    if (Date.parse(session.expiresAt) <= Date.now()) { this.conversationSessions.delete(readConversationSessionKey(pluginId, conversationId)); return null; }
    return session;
  }

  private readSessionTimeoutMs(params: JsonObject): number {
    const timeoutMs = readPositiveInteger(params, 'timeoutMs');
    if (timeoutMs) {return timeoutMs;}
    throw new BadRequestException('timeoutMs must be a positive integer');
  }

  private saveConversations(): void { fs.mkdirSync(path.dirname(this.storagePath), { recursive: true }); fs.writeFileSync(this.storagePath, JSON.stringify({ conversations: Object.fromEntries([...this.conversations.entries()].map(([id, record]) => [id, cloneJsonValue(record)])) }, null, 2), 'utf-8'); }

  private loadConversations(): { migrated: boolean; records: Map<string, RuntimeConversationRecord> } {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return { migrated: false, records: new Map<string, RuntimeConversationRecord>() };}
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as { conversations?: Record<string, RuntimeConversationRecord> };
      const entries = Object.entries(parsed.conversations ?? {});
      const records = new Map(entries.flatMap(([id, record]) =>
        record.userId === SINGLE_USER_ID ? [[id, cloneJsonValue(record)]] : []));
      return { migrated: records.size !== entries.length, records };
    } catch {
      return { migrated: false, records: new Map<string, RuntimeConversationRecord>() };
    }
  }

  private async broadcastConversationCreated(conversation: JsonObject, userId: string): Promise<void> {
    const runtimeKernelService = this.runtimeHostPluginDispatchService;
    if (!runtimeKernelService) {return;}
    const context = { conversationId: String(conversation.id), source: 'http-route' as const, userId };
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:created', kernel: runtimeKernelService })) {
      await runtimeKernelService.invokeHook({ context, hookName: 'conversation:created', payload: asJsonValue({ context, conversation }), pluginId });
    }
  }
}

function readRevisionSeed(revision: string): string { const lastSeparator = revision.lastIndexOf(':'); return lastSeparator > 0 ? revision.slice(0, lastSeparator) : revision; }

function buildConversationDetail(conversation: RuntimeConversationRecord): JsonValue {
  return asJsonValue({ _count: { messages: conversation.messages.length }, createdAt: conversation.createdAt, id: conversation.id, messages: conversation.messages.map((message) => serializeConversationMessage(message)), title: conversation.title, updatedAt: conversation.updatedAt });
}

function buildConversationOverview(conversation: RuntimeConversationRecord): JsonObject { return { _count: { messages: conversation.messages.length }, createdAt: conversation.createdAt, id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt }; }

function buildConversationSkillState(conversation: RuntimeConversationRecord): JsonValue {
  return { activeSkillIds: [...conversation.activeSkillIds], activeSkills: conversation.activeSkillIds.map((skillId) => ({ id: skillId, name: skillId })) };
}

function buildConversationSummary(conversation: RuntimeConversationRecord): JsonValue { return { ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}), createdAt: conversation.createdAt, id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt }; }

function buildConversationHistorySnapshot(conversation: RuntimeConversationRecord): {
  conversationId: string;
  revision: string;
  messages: JsonObject[];
} {
  return {
    conversationId: conversation.id,
    revision: conversation.revision,
    messages: conversation.messages.map((message) => serializeConversationHistoryMessage(message)),
  };
}

function buildConversationHistoryPreview(messages: JsonObject[]): JsonValue {
  const textBytes = estimateConversationHistoryTextBytes(messages);
  return asJsonValue({
    estimatedTokens: Math.ceil(textBytes / 4),
    messageCount: messages.length,
    textBytes,
  });
}

function readConversationSessionKey(pluginId: string, conversationId: string): string { return `${pluginId}:${conversationId}`; }

function resolveConversationStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATIONS_PATH) {return process.env.GARLIC_CLAW_CONVERSATIONS_PATH;}
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `conversations.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);}
  return path.join(process.cwd(), 'tmp', 'conversations.server.json');
}

function serializeConversationSession(session: RuntimeConversationSessionRecord | null): JsonValue {
  return session ? { ...(session.metadata ? { metadata: cloneJsonValue(session.metadata) } : {}), captureHistory: session.captureHistory, conversationId: session.conversationId, expiresAt: session.expiresAt, historyMessages: session.historyMessages.map((message) => cloneJsonValue(message)), lastMatchedAt: session.lastMatchedAt, pluginId: session.pluginId, startedAt: session.startedAt, timeoutMs: session.timeoutMs } : null;
}

export function serializeConversationMessage(message: JsonObject) { return { content: typeof message.content === 'string' ? message.content : null, createdAt: String(message.createdAt), error: typeof message.error === 'string' ? message.error : null, id: String(message.id), metadataJson: typeof message.metadataJson === 'string' ? message.metadataJson : null, model: typeof message.model === 'string' ? message.model : null, partsJson: Array.isArray(message.parts) && message.parts.length > 0 ? JSON.stringify(message.parts) : null, provider: typeof message.provider === 'string' ? message.provider : null, role: String(message.role), status: message.status, toolCalls: Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? JSON.stringify(message.toolCalls) : null, toolResults: Array.isArray(message.toolResults) && message.toolResults.length > 0 ? JSON.stringify(message.toolResults) : null, updatedAt: String(message.updatedAt) }; }

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

function readConversationHistoryMessagesInput(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('messages must be an array');
  }
  return value.map((entry, index) => normalizeConversationHistoryMessage(entry, index));
}

function normalizeConversationHistoryMessage(value: unknown, index: number): JsonObject {
  const object = readJsonObject(value);
  if (!object) {
    throw new BadRequestException(`messages[${index}] must be an object`);
  }
  const id = readRequiredConversationHistoryString(object, 'id', index);
  const role = readRequiredConversationHistoryString(object, 'role', index);
  const content = readOptionalConversationHistoryString(object.content, `messages[${index}].content`);
  const status = readOptionalConversationHistoryStatus(object.status, `messages[${index}].status`) ?? 'completed';
  const createdAt = readConversationHistoryTimestamp(object.createdAt, `messages[${index}].createdAt`);
  const updatedAt = readConversationHistoryTimestamp(object.updatedAt, `messages[${index}].updatedAt`);
  const parts = readConversationHistoryParts(object.parts, index);
  const metadata = readConversationHistoryMetadata(object.metadata, index);
  const toolCalls = readConversationHistoryJsonArray(object.toolCalls, `messages[${index}].toolCalls`);
  const toolResults = readConversationHistoryJsonArray(object.toolResults, `messages[${index}].toolResults`);
  return {
    content: content ?? '',
    createdAt,
    ...(typeof object.error === 'string' ? { error: object.error } : {}),
    id,
    ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    ...(typeof object.model === 'string' ? { model: object.model } : {}),
    parts: asJsonValue(parts) as unknown as JsonObject['parts'],
    ...(typeof object.provider === 'string' ? { provider: object.provider } : {}),
    role,
    status,
    ...(toolCalls ? { toolCalls: asJsonValue(toolCalls) as unknown as JsonObject['toolCalls'] } : {}),
    ...(toolResults ? { toolResults: asJsonValue(toolResults) as unknown as JsonObject['toolResults'] } : {}),
    updatedAt,
  };
}

function readRequiredConversationHistoryString(params: JsonObject, key: string, index?: number): string {
  const value = params[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (index === undefined) {
    throw new BadRequestException(`${key} is required`);
  }
  throw new BadRequestException(`messages[${index}].${key} is required`);
}

function readOptionalConversationHistoryString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new BadRequestException(`${label} must be string or null`);
}

function readOptionalConversationHistoryStatus(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === 'pending' || value === 'streaming' || value === 'completed' || value === 'stopped' || value === 'error') {
    return value;
  }
  throw new BadRequestException(`${label} is invalid`);
}

function readConversationHistoryTimestamp(value: unknown, _label: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

function readConversationHistoryParts(value: unknown, index: number): ChatMessagePart[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException(`messages[${index}].parts must be an array`);
  }
  return value.map((entry, partIndex) => normalizeConversationHistoryPart(entry, index, partIndex));
}

function normalizeConversationHistoryPart(value: unknown, messageIndex: number, partIndex: number): ChatMessagePart {
  const object = readJsonObject(value);
  if (!object || typeof object.type !== 'string') {
    throw new BadRequestException(`messages[${messageIndex}].parts[${partIndex}] is invalid`);
  }
  if (object.type === 'text' && typeof object.text === 'string') {
    return { text: object.text, type: 'text' };
  }
  if (object.type === 'image' && typeof object.image === 'string') {
    return {
      image: object.image,
      ...(typeof object.mimeType === 'string' ? { mimeType: object.mimeType } : {}),
      type: 'image',
    };
  }
  throw new BadRequestException(`messages[${messageIndex}].parts[${partIndex}] is invalid`);
}

function readConversationHistoryMetadata(value: unknown, index: number): ChatMessageMetadata | null {
  if (value === undefined || value === null) {
    return null;
  }
  const object = readJsonObject(value);
  if (!object) {
    throw new BadRequestException(`messages[${index}].metadata must be an object`);
  }
  const metadata: ChatMessageMetadata = {};
  if (object.visionFallback !== undefined) {
    metadata.visionFallback = readConversationHistoryVisionFallback(object.visionFallback, index);
  }
  if (object.customBlocks !== undefined) {
    metadata.customBlocks = readConversationHistoryCustomBlocks(object.customBlocks, index);
  }
  if (object.annotations !== undefined) {
    metadata.annotations = readConversationHistoryAnnotations(object.annotations, index);
  }
  return metadata;
}

function readConversationHistoryVisionFallback(value: unknown, index: number): NonNullable<ChatMessageMetadata['visionFallback']> {
  const object = readJsonObject(value);
  if (!object || (object.state !== 'completed' && object.state !== 'transcribing') || !Array.isArray(object.entries)) {
    throw new BadRequestException(`messages[${index}].metadata.visionFallback is invalid`);
  }
  return {
    entries: object.entries.map((entry, entryIndex) => {
      const item = readJsonObject(entry);
      if (!item || typeof item.text !== 'string' || (item.source !== 'cache' && item.source !== 'generated')) {
        throw new BadRequestException(`messages[${index}].metadata.visionFallback.entries[${entryIndex}] is invalid`);
      }
      return {
        source: item.source,
        text: item.text,
      };
    }),
    state: object.state,
  };
}

function readConversationHistoryCustomBlocks(value: unknown, index: number): NonNullable<ChatMessageMetadata['customBlocks']> {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`messages[${index}].metadata.customBlocks must be an array`);
  }
  return value.map((entry, blockIndex) => {
    const object = readJsonObject(entry);
    if (!object || typeof object.id !== 'string' || typeof object.title !== 'string') {
      throw new BadRequestException(`messages[${index}].metadata.customBlocks[${blockIndex}] is invalid`);
    }
    if (object.kind === 'text' && typeof object.text === 'string') {
      return {
        id: object.id,
        kind: 'text' as const,
        ...(object.source && readJsonObject(object.source) ? { source: cloneJsonValue(object.source) as { key?: string; origin?: string; providerId?: string } } : {}),
        ...(object.state === 'done' || object.state === 'streaming' ? { state: object.state } : {}),
        text: object.text,
        title: object.title,
      };
    }
    if (object.kind === 'json' && object.data !== undefined) {
      return {
        data: cloneJsonValue(object.data) as JsonValue,
        id: object.id,
        kind: 'json' as const,
        ...(object.source && readJsonObject(object.source) ? { source: cloneJsonValue(object.source) as { key?: string; origin?: string; providerId?: string } } : {}),
        ...(object.state === 'done' || object.state === 'streaming' ? { state: object.state } : {}),
        title: object.title,
      };
    }
    throw new BadRequestException(`messages[${index}].metadata.customBlocks[${blockIndex}] is invalid`);
  });
}

function readConversationHistoryAnnotations(value: unknown, index: number): NonNullable<ChatMessageMetadata['annotations']> {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`messages[${index}].metadata.annotations must be an array`);
  }
  return value.map((entry, annotationIndex) => {
    const object = readJsonObject(entry);
    if (!object || typeof object.type !== 'string' || typeof object.owner !== 'string' || typeof object.version !== 'string') {
      throw new BadRequestException(`messages[${index}].metadata.annotations[${annotationIndex}] is invalid`);
    }
    return {
      ...(object.data !== undefined ? { data: cloneJsonValue(object.data) as JsonValue } : {}),
      owner: object.owner,
      type: object.type,
      version: object.version,
    };
  });
}

function readConversationHistoryJsonArray(value: unknown, label: string): JsonValue[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an array`);
  }
  return value.map((entry) => cloneJsonValue(entry) as JsonValue);
}

function readStoredConversationMetadata(value: unknown): ChatMessageMetadata | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as ChatMessageMetadata;
  } catch {
    return null;
  }
}

function estimateConversationHistoryTextBytes(messages: JsonObject[]): number {
  return Buffer.byteLength(messages.map(readConversationHistoryMessageText).join('\n'), 'utf8');
}

function readConversationHistoryMessageText(message: JsonObject): string {
  const partText = Array.isArray(message.parts)
    ? (message.parts as unknown[])
      .flatMap((part) => {
        const object = readJsonObject(part);
        return object?.type === 'text' && typeof object.text === 'string'
          ? [object.text]
          : [];
      })
      .join('\n')
    : '';
  const content = partText || (typeof message.content === 'string' ? message.content : '');
  const toolCalls = Array.isArray(message.toolCalls) ? JSON.stringify(message.toolCalls) : '';
  const toolResults = Array.isArray(message.toolResults) ? JSON.stringify(message.toolResults) : '';
  return [typeof message.role === 'string' ? message.role : '', content, toolCalls, toolResults]
    .filter(Boolean)
    .join('\n');
}
