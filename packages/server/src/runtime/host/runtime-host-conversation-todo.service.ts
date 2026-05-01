import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConversationTodoItem, JsonValue } from '@garlic-claw/shared';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createServerTestArtifactPath, resolveServerStatePath } from '../server-workspace-paths';
import { asJsonValue, cloneJsonValue } from './runtime-host-values';
import {
  resolveConversationStoragePath,
  RuntimeHostConversationRecordService,
} from './runtime-host-conversation-record.service';

interface RuntimeConversationTodoStoragePayload {
  todos?: Record<string, ConversationTodoItem[]>;
}

interface RuntimeLegacyConversationStoragePayload {
  conversations?: Record<string, unknown>;
  todos?: Record<string, ConversationTodoItem[]>;
}

export interface RuntimeHostConversationTodoEvent {
  sessionId: string;
  todos: ConversationTodoItem[];
}

@Injectable()
export class RuntimeHostConversationTodoService {
  private readonly storagePath = resolveConversationTodoStoragePath();
  private readonly conversationTodos: Map<string, ConversationTodoItem[]>;
  private readonly listeners = new Map<string, Set<(event: RuntimeHostConversationTodoEvent) => void>>();

  constructor(
    @Inject(forwardRef(() => RuntimeHostConversationRecordService))
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  ) {
    const { migrated, todos } = this.readStoredTodos();
    this.conversationTodos = todos;
    if (migrated) {
      this.persistTodos();
    }
  }

  deleteSessionTodo(sessionId: string): void {
    if (!this.conversationTodos.delete(sessionId)) {
      return;
    }
    this.persistTodos();
    this.emit(sessionId, []);
  }

  readSessionTodo(sessionId: string, userId?: string): JsonValue {
    return asJsonValue(this.readSessionTodoItems(sessionId, userId));
  }

  replaceSessionTodo(sessionId: string, todos: ConversationTodoItem[], userId?: string): JsonValue {
    const nextTodos = this.readClonedTodoItems(todos);
    this.runtimeHostConversationRecordService.requireConversation(sessionId, userId);
    this.conversationTodos.set(sessionId, nextTodos);
    this.persistTodos();
    this.emit(sessionId, nextTodos);
    return asJsonValue(this.readClonedTodoItems(nextTodos));
  }

  readSessionTodoItems(sessionId: string, userId?: string): ConversationTodoItem[] {
    this.runtimeHostConversationRecordService.requireConversation(sessionId, userId);
    return this.readClonedTodoItems(this.conversationTodos.get(sessionId) ?? []);
  }

  subscribe(sessionId: string, listener: (event: RuntimeHostConversationTodoEvent) => void): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<(event: RuntimeHostConversationTodoEvent) => void>();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      const current = this.listeners.get(sessionId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  private persistTodos(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const todos = Object.fromEntries(
      [...this.conversationTodos.entries()].map(([id, items]) => [id, cloneJsonValue(items)]),
    );
    fs.writeFileSync(
      this.storagePath,
      JSON.stringify(Object.keys(todos).length > 0 ? { todos } : {}, null, 2),
      'utf-8',
    );
  }

  private readStoredTodos(): { migrated: boolean; todos: Map<string, ConversationTodoItem[]> } {
    const direct = readConversationTodoStoragePayload(this.storagePath);
    if (direct) {
      return filterStoredTodos(this.runtimeHostConversationRecordService, direct);
    }
    const legacyStoragePath = resolveConversationStoragePath();
    const legacy = readLegacyConversationTodoStoragePayload(legacyStoragePath);
    if (!legacy) {
      return { migrated: false, todos: new Map() };
    }
    stripLegacyConversationTodoStoragePayload(legacyStoragePath);
    const filtered = filterStoredTodos(this.runtimeHostConversationRecordService, legacy);
    return {
      migrated: true,
      todos: filtered.todos,
    };
  }

  private emit(sessionId: string, todos: ConversationTodoItem[]): void {
    const event = { sessionId, todos: this.readClonedTodoItems(todos) };
    for (const listener of this.listeners.get(sessionId) ?? []) {
      listener(event);
    }
  }

  private readClonedTodoItems(items: ConversationTodoItem[]): ConversationTodoItem[] {
    return items.map((item) => cloneJsonValue(item));
  }
}

function resolveConversationTodoStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATION_TODOS_PATH) {
    return process.env.GARLIC_CLAW_CONVERSATION_TODOS_PATH;
  }
  if (process.env.JEST_WORKER_ID) {
    return createServerTestArtifactPath({ extension: '.json', prefix: 'conversation-todos.server.test', subdirectory: 'server' });
  }
  return resolveServerStatePath('conversation-todos.server.json');
}

function readConversationTodoStoragePayload(storagePath: string): Map<string, ConversationTodoItem[]> | null {
  try {
    if (!fs.existsSync(storagePath)) {
      return null;
    }
    const payload = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as RuntimeConversationTodoStoragePayload;
    return new Map(
      Object.entries(payload.todos ?? {}).flatMap(([conversationId, items]) =>
        Array.isArray(items) ? [[conversationId, cloneJsonValue(items)]] : [],
      ),
    );
  } catch {
    return null;
  }
}

function readLegacyConversationTodoStoragePayload(storagePath: string): Map<string, ConversationTodoItem[]> | null {
  try {
    if (!fs.existsSync(storagePath)) {
      return null;
    }
    const payload = JSON.parse(
      fs.readFileSync(storagePath, 'utf-8'),
    ) as RuntimeLegacyConversationStoragePayload;
    if (!payload.todos || typeof payload.todos !== 'object') {
      return null;
    }
    return new Map(
      Object.entries(payload.todos).flatMap(([conversationId, items]) =>
        Array.isArray(items) ? [[conversationId, cloneJsonValue(items)]] : [],
      ),
    );
  } catch {
    return null;
  }
}

function stripLegacyConversationTodoStoragePayload(storagePath: string): void {
  try {
    if (!fs.existsSync(storagePath)) {
      return;
    }
    const payload = JSON.parse(
      fs.readFileSync(storagePath, 'utf-8'),
    ) as RuntimeLegacyConversationStoragePayload;
    if (!payload.todos || typeof payload.todos !== 'object') {
      return;
    }
    delete payload.todos;
    fs.writeFileSync(storagePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch {
    // legacy 清理失败时不阻塞 todo 迁移。
  }
}

function filterStoredTodos(
  runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  todos: Map<string, ConversationTodoItem[]>,
): { migrated: boolean; todos: Map<string, ConversationTodoItem[]> } {
  const filtered = new Map(
    [...todos.entries()].flatMap(([conversationId, items]) => {
      try {
        runtimeHostConversationRecordService.requireConversation(conversationId);
        return [[conversationId, items]] as const;
      } catch {
        return [];
      }
    }),
  );
  return {
    migrated: filtered.size !== todos.size,
    todos: filtered,
  };
}
