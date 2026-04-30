import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../../src/auth/single-user-auth';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostConversationTodoService } from '../../../src/runtime/host/runtime-host-conversation-todo.service';
import { RuntimeHostPluginDispatchService } from '../../../src/runtime/host/runtime-host-plugin-dispatch.service';

describe('RuntimeHostConversationRecordService', () => {
  const conversationsEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const runtimeWorkspaceEnvKey = 'GARLIC_CLAW_RUNTIME_WORKSPACES_PATH';
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let storagePath: string;
  let runtimeWorkspaceRoot: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `runtime-host-conversation-record.service.spec-${Date.now()}-${Math.random()}.json`);
    runtimeWorkspaceRoot = path.join(os.tmpdir(), `runtime-host-conversation-record.workspace-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    delete process.env[conversationsEnvKey];
    delete process.env[runtimeWorkspaceEnvKey];
    try {
      for (const filePath of [storagePath]) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      fs.rmSync(runtimeWorkspaceRoot, { force: true, recursive: true });
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });

  it('creates, lists, persists and mutates conversation state', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const created = service.createConversation({ title: 'New Chat' }) as { id: string };
    const conversationId = created.id;

    expect(created).toEqual({
      _count: { messages: 0 },
      createdAt: expect.any(String),
      id: expect.any(String),
      title: 'New Chat',
      updatedAt: expect.any(String),
    });
    expect(conversationId).toMatch(uuidV7Pattern);
    expect(service.listConversations()).toEqual([
      {
        _count: { messages: 0 },
        createdAt: expect.any(String),
        id: conversationId,
        title: 'New Chat',
        updatedAt: expect.any(String),
      },
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:command.execute')).toEqual([
      'just-bash:command.execute',
    ]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:network.access')).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);

    const beforeRevision = service.readConversationRevision(conversationId);
    service.replaceMessages(conversationId, [{
      content: 'hello',
      createdAt: '2026-04-11T00:00:00.000Z',
      id: '019dc88c-1a10-7d45-9c5b-c748bc2ce1b4',
      role: 'assistant',
      status: 'completed',
      updatedAt: '2026-04-11T00:00:00.000Z',
    }]);
    expect(service.readConversationRevision(conversationId)).not.toBe(beforeRevision);
    expect(service.getConversation(conversationId)).toEqual({
      _count: { messages: 1 },
      createdAt: expect.any(String),
      id: conversationId,
      messages: [
        {
          content: 'hello',
          createdAt: '2026-04-11T00:00:00.000Z',
          error: null,
          id: '019dc88c-1a10-7d45-9c5b-c748bc2ce1b4',
          metadataJson: null,
          model: null,
          partsJson: null,
          provider: null,
          role: 'assistant',
          status: 'completed',
          toolCalls: null,
          toolResults: null,
          updatedAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      title: 'New Chat',
      updatedAt: expect.any(String),
    });

    const reloaded = new RuntimeHostConversationRecordService();
    expect(reloaded.getConversation(conversationId)).toEqual(service.getConversation(conversationId));
    expect(reloaded.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);
    await expect(service.deleteConversation(conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
  });

  it('throws instead of auto-creating missing conversations on read paths', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();

    expect(() => service.requireConversation('missing')).toThrow(NotFoundException);
    expect(() => service.getConversation('missing')).toThrow(NotFoundException);
  });

  it('throws ForbiddenException when reading another user conversation', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'New Chat', userId: 'user-1' }) as { id: string }).id;

    expect(() => service.requireConversation(conversationId, 'user-2')).toThrow(ForbiddenException);
  });

  it('broadcasts conversation:created when runtime kernel is available', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const runtimeKernelService = {
      invokeHook: jest.fn().mockResolvedValue(null),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'conversation:created' }] },
          pluginId: 'builtin.audit',
        },
      ]),
    };
    const service = new RuntimeHostConversationRecordService(runtimeKernelService as unknown as RuntimeHostPluginDispatchService);

    service.createConversation({ title: 'New Chat', userId: 'user-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ source: 'http-route', userId: 'user-1' }),
      hookName: 'conversation:created',
    }));
  });

  it('reads, previews and replaces conversation history with annotation metadata and revision protection', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'History Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as {
      revision: string;
    };

    const replaced = service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '你好',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'message-1',
          metadata: {
            annotations: [
              {
                data: {
                  coveredCount: 2,
                  role: 'summary',
                },
                owner: 'builtin.context-compaction',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          parts: [
            {
              text: '你好',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
      ],
    }) as {
      changed: boolean;
      messages: Array<Record<string, unknown>>;
      revision: string;
    };

    expect(replaced.changed).toBe(true);
    expect(replaced.messages).toEqual([
      expect.objectContaining({
        content: '你好',
        id: 'message-1',
        metadata: {
          annotations: [
            {
              data: {
                coveredCount: 2,
                role: 'summary',
              },
              owner: 'builtin.context-compaction',
              type: 'context-compaction',
              version: '1',
            },
          ],
        },
        parts: [
          {
            text: '你好',
            type: 'text',
          },
        ],
        role: 'assistant',
      }),
    ]);

    const preview = service.previewConversationHistory(conversationId, {}) as {
      estimatedTokens: number;
      messageCount: number;
      textBytes: number;
    };
    const expectedTextBytes = Buffer.byteLength('assistant\n你好', 'utf8');
    expect(preview).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 1,
      textBytes: expectedTextBytes,
    });

    expect(() => service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [],
    })).toThrow(ConflictException);
  });

  it('excludes display messages from conversation history token preview', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'Display Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as {
      revision: string;
    };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '/compact',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'display-command',
          metadata: {
            annotations: [
              {
                data: {
                  variant: 'command',
                },
                owner: 'conversation.display-message',
                type: 'display-message',
                version: '1',
              },
            ],
          },
          parts: [
            {
              text: '/compact',
              type: 'text',
            },
          ],
          role: 'display',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '正常消息',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          parts: [
            {
              text: '正常消息',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    const preview = service.previewConversationHistory(conversationId, {}) as {
      estimatedTokens: number;
      messageCount: number;
      textBytes: number;
    };
    const expectedTextBytes = Buffer.byteLength('assistant\n正常消息', 'utf8');

    expect(preview).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 2,
      textBytes: expectedTextBytes,
    });
  });

  it('prefers the latest matching provider usage annotation when previewing history tokens', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'Usage Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '你好',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'user-message',
          parts: [{ text: '你好', type: 'text' }],
          role: 'user',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '世界',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '世界', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    expect(service.previewConversationHistory(conversationId, {
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).toEqual({
      estimatedTokens: 77,
      messageCount: 2,
      textBytes: Buffer.byteLength('user\n你好\nassistant\n世界', 'utf8'),
    });
  });

  it('falls back to estimated history tokens when the preview model changes', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'Model Switch Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '你好',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '你好', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    const expectedTextBytes = Buffer.byteLength('assistant\n你好', 'utf8');
    expect(service.previewConversationHistory(conversationId, {
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    })).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 1,
      textBytes: expectedTextBytes,
    });
  });

  it('deletes runtime workspace together with the conversation', async () => {
    process.env[conversationsEnvKey] = storagePath;
    process.env[runtimeWorkspaceEnvKey] = runtimeWorkspaceRoot;
    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostConversationRecordService(undefined, runtimeSessionEnvironmentService);
    const conversationId = (service.createConversation({ title: 'Runtime Chat' }) as { id: string }).id;
    const sessionRoot = (await runtimeSessionEnvironmentService.getSessionEnvironment(conversationId)).sessionRoot;
    fs.mkdirSync(path.join(sessionRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, 'notes', 'runtime.txt'), 'runtime');

    expect(fs.existsSync(path.join(sessionRoot, 'notes', 'runtime.txt'))).toBe(true);

    await expect(service.deleteConversation(conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
    expect(fs.existsSync(sessionRoot)).toBe(false);
  });

  it('deletes child subagent conversations together with the parent conversation', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const parentConversationId = (service.createConversation({ title: 'Parent Chat', userId: 'user-1' }) as { id: string }).id;
    const childConversationId = (service.createConversation({
      kind: 'subagent',
      parentId: parentConversationId,
      subagent: {
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '整理上下文',
        requestedAt: '2026-04-25T00:00:00.000Z',
        runtimeKind: 'local',
        status: 'queued',
        writeBackStatus: 'pending',
        writeBackTarget: {
          id: parentConversationId,
          type: 'conversation',
        },
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
      title: 'Child Chat',
      userId: 'user-1',
    }) as { id: string }).id;

    await expect(service.deleteConversation(parentConversationId, 'user-1')).resolves.toEqual({ message: 'Conversation deleted' });

    expect(() => service.requireConversation(parentConversationId, 'user-1')).toThrow(NotFoundException);
    expect(() => service.requireConversation(childConversationId, 'user-1')).toThrow(NotFoundException);
    expect(service.listSubagentConversations('user-1')).toEqual([]);
  });

  it('persists plugin conversation sessions across service reloads', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'Session Chat', userId: 'user-1' }) as { id: string }).id;

    expect(service.startConversationSession('builtin.memory', {
      conversationId,
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      captureHistory: true,
      metadata: {
        flow: 'memory',
      },
      timeoutMs: 60_000,
    })).toEqual({
      captureHistory: true,
      conversationId,
      expiresAt: expect.any(String),
      historyMessages: [],
      lastMatchedAt: null,
      metadata: {
        flow: 'memory',
      },
      pluginId: 'builtin.memory',
      startedAt: expect.any(String),
      timeoutMs: 60_000,
    });

    const reloaded = new RuntimeHostConversationRecordService();

    expect(reloaded.getConversationSession('builtin.memory', {
      conversationId,
      source: 'chat-hook',
      userId: 'user-1',
    })).toEqual({
      captureHistory: true,
      conversationId,
      expiresAt: expect.any(String),
      historyMessages: [],
      lastMatchedAt: null,
      metadata: {
        flow: 'memory',
      },
      pluginId: 'builtin.memory',
      startedAt: expect.any(String),
      timeoutMs: 60_000,
    });
  });

  it('drops legacy todos from conversation storage payload after reload', () => {
    process.env[conversationsEnvKey] = storagePath;
    const legacyConversationId = '019dc88c-1a11-7806-a2ff-9f4ab8d4fb47';
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        [legacyConversationId]: {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: legacyConversationId,
          messages: [],
          revision: `${legacyConversationId}:seed:0`,
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
      },
      todos: {
        [legacyConversationId]: [
          { content: 'legacy todo', priority: 'high', status: 'pending' },
        ],
      },
    }, null, 2), 'utf-8');

    const service = new RuntimeHostConversationRecordService();
    const todoService = new RuntimeHostConversationTodoService(service);

    expect(todoService.readSessionTodo(legacyConversationId)).toEqual([
      { content: 'legacy todo', priority: 'high', status: 'pending' },
    ]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {
        [legacyConversationId]: expect.objectContaining({
          id: legacyConversationId,
          title: 'Legacy Chat',
        }),
      },
    });
  });

  it('deletes persisted legacy user conversations that no longer符合单用户模型', () => {
    process.env[conversationsEnvKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: 'conversation-legacy',
          messages: [],
          revision: 'conversation-legacy:seed:0',
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: 'legacy-user',
        },
      },
    }, null, 2), 'utf-8');

    const service = new RuntimeHostConversationRecordService();

    expect(service.listConversations(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {},
    });
  });

  it('deletes persisted legacy conversations with non-v7 conversation or message ids', () => {
    process.env[conversationsEnvKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: 'conversation-legacy',
          messages: [],
          revision: 'conversation-legacy:seed:0',
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
        '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250',
          messages: [{
            content: 'legacy message',
            createdAt: '2026-04-10T00:00:00.000Z',
            id: '11111111-1111-4111-8111-111111111111',
            role: 'assistant',
            status: 'completed',
            updatedAt: '2026-04-10T00:00:00.000Z',
          }],
          revision: '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250:seed:0',
          revisionVersion: 0,
          title: 'Legacy Message Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
      },
    }, null, 2), 'utf-8');

    const service = new RuntimeHostConversationRecordService();

    expect(service.listConversations(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {},
    });
  });
});
