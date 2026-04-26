import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConversationTodoItem, JsonValue } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { asJsonValue, cloneJsonValue } from './runtime-host-values';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';

interface RuntimeConversationTodoStoragePayload {
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
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  ) {
    const stored = this.readStoredTodos();
    this.conversationTodos = stored.todos;
    if (stored.migrated) {
      this.persistTodos();
      if (stored.cleanupLegacy) {
        cleanupLegacyConversationTodoPayload();
      }
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

  private readStoredTodos(): { cleanupLegacy: boolean; migrated: boolean; todos: Map<string, ConversationTodoItem[]> } {
    const direct = readConversationTodoStoragePayload(this.storagePath);
    if (direct) {
      return filterStoredTodos(this.runtimeHostConversationRecordService, direct, false);
    }
    const legacy = readConversationTodoStoragePayload(resolveLegacyConversationStoragePath());
    return legacy
      ? filterStoredTodos(this.runtimeHostConversationRecordService, legacy, true)
      : { cleanupLegacy: false, migrated: false, todos: new Map() };
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
    return path.join(
      process.cwd(),
      'tmp',
      `conversation-todos.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
  }
  return path.join(process.cwd(), 'tmp', 'conversation-todos.server.json');
}

function resolveLegacyConversationStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATIONS_PATH) {
    return process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
  }
  return path.join(process.cwd(), 'tmp', 'conversations.server.json');
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

function cleanupLegacyConversationTodoPayload(): void {
  const storagePath = resolveLegacyConversationStoragePath();
  try {
    if (!fs.existsSync(storagePath)) {
      return;
    }
    const payload = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as RuntimeConversationTodoStoragePayload & {
      conversations?: Record<string, unknown>;
    };
    if (!payload.todos) {
      return;
    }
    fs.writeFileSync(
      storagePath,
      JSON.stringify(payload.conversations ? { conversations: payload.conversations } : {}, null, 2),
      'utf-8',
    );
  } catch {
    // 迁移清理失败不影响当前 todo owner 可用性。
  }
}

function filterStoredTodos(
  runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
  todos: Map<string, ConversationTodoItem[]>,
  cleanupLegacy: boolean,
): { cleanupLegacy: boolean; migrated: boolean; todos: Map<string, ConversationTodoItem[]> } {
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
    cleanupLegacy,
    migrated: cleanupLegacy || filtered.size !== todos.size,
    todos: filtered,
  };
}
