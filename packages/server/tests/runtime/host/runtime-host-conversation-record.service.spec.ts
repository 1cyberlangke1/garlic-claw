import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../../src/auth/single-user-auth';
import { RuntimeWorkspaceService } from '../../../src/execution/runtime/runtime-workspace.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../../../src/runtime/host/runtime-host-plugin-dispatch.service';

describe('RuntimeHostConversationRecordService', () => {
  const conversationsEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const runtimeWorkspaceEnvKey = 'GARLIC_CLAW_RUNTIME_WORKSPACES_PATH';
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
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      fs.rmSync(runtimeWorkspaceRoot, { force: true, recursive: true });
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });

  it('creates, lists, persists and mutates conversation state', () => {
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
    expect(service.listConversations()).toEqual([
      {
        _count: { messages: 0 },
        createdAt: expect.any(String),
        id: conversationId,
        title: 'New Chat',
        updatedAt: expect.any(String),
      },
    ]);
    expect(service.readConversationHostServices(conversationId)).toEqual({
      llmEnabled: true,
      sessionEnabled: true,
      ttsEnabled: true,
    });
    expect(service.writeConversationHostServices(conversationId, { ttsEnabled: false })).toEqual({
      llmEnabled: true,
      sessionEnabled: true,
      ttsEnabled: false,
    });
    expect(service.replaceSessionTodo(conversationId, [
      { content: '实现 todo 工具', priority: 'high', status: 'in_progress' },
    ])).toEqual([
      { content: '实现 todo 工具', priority: 'high', status: 'in_progress' },
    ]);
    expect(service.readSessionTodo(conversationId)).toEqual([
      { content: '实现 todo 工具', priority: 'high', status: 'in_progress' },
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:shellExecution')).toEqual([
      'just-bash:shellExecution',
    ]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:networkAccess')).toEqual([
      'just-bash:networkAccess',
      'just-bash:shellExecution',
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:networkAccess',
      'just-bash:shellExecution',
    ]);

    const beforeRevision = service.readConversationRevision(conversationId);
    service.replaceMessages(conversationId, [{
      content: 'hello',
      createdAt: '2026-04-11T00:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
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
          id: '11111111-1111-4111-8111-111111111111',
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
    expect(reloaded.readSessionTodo(conversationId)).toEqual([
      { content: '实现 todo 工具', priority: 'high', status: 'in_progress' },
    ]);
    expect(reloaded.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:networkAccess',
      'just-bash:shellExecution',
    ]);
    expect(service.deleteConversation(conversationId)).toEqual({ message: 'Conversation deleted' });
  });

  it('throws instead of auto-creating missing conversations on read paths', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();

    expect(() => service.requireConversation('missing')).toThrow(NotFoundException);
    expect(() => service.getConversation('missing')).toThrow(NotFoundException);
    expect(() => service.readConversationHostServices('missing')).toThrow(NotFoundException);
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

  it('deletes runtime workspace together with the conversation', async () => {
    process.env[conversationsEnvKey] = storagePath;
    process.env[runtimeWorkspaceEnvKey] = runtimeWorkspaceRoot;
    const runtimeWorkspaceService = new RuntimeWorkspaceService();
    const service = new RuntimeHostConversationRecordService(undefined, runtimeWorkspaceService);
    const conversationId = (service.createConversation({ title: 'Runtime Chat' }) as { id: string }).id;
    const workspaceRoot = await runtimeWorkspaceService.resolveWorkspaceRoot(conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'runtime');

    expect(fs.existsSync(path.join(workspaceRoot, 'notes', 'runtime.txt'))).toBe(true);

    expect(service.deleteConversation(conversationId)).toEqual({ message: 'Conversation deleted' });
    expect(fs.existsSync(workspaceRoot)).toBe(false);
  });

  it('deletes persisted legacy user conversations that no longer符合单用户模型', () => {
    process.env[conversationsEnvKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          createdAt: '2026-04-10T00:00:00.000Z',
          hostServices: { llmEnabled: true, sessionEnabled: true, ttsEnabled: true },
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
});
