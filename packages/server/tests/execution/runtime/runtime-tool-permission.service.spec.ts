import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeToolPermissionService } from '../../../src/execution/runtime/runtime-tool-permission.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';

describe('RuntimeToolPermissionService', () => {
  let conversationId: string;
  let service: RuntimeToolPermissionService;
  let conversationsPath: string;
  const originalApprovalMode = process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE;

  beforeEach(() => {
    conversationsPath = path.join(
      os.tmpdir(),
      `runtime-tool-permission.service.spec-${Date.now()}-${Math.random()}.json`,
    );
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    const conversationRecordService = new RuntimeHostConversationRecordService();
    conversationId = (conversationRecordService.createConversation({
      title: 'Runtime Permission Test',
    }) as { id: string }).id;
    expect(conversationId).toBeTruthy();
    service = new RuntimeToolPermissionService(conversationRecordService);
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    if (originalApprovalMode === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE = originalApprovalMode;
    }
    try {
      if (fs.existsSync(conversationsPath)) {
        fs.unlinkSync(conversationsPath);
      }
    } catch {
      // 忽略测试临时文件清理失败。
    }
  });

  it('allows immediately when required operations are already allowed', async () => {
    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['file.read'],
      summary: '读取工作区文件',
      toolName: 'read',
    })).resolves.toBeUndefined();
  });

  it('creates a pending request and remembers always approvals', async () => {
    const reviewPromise = service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      messageId: 'message-1',
      requiredOperations: ['command.execute'],
      summary: '执行 bash 命令',
      toolName: 'bash',
    });

    const [pendingRequest] = service.listPendingRequests(conversationId);
    expect(pendingRequest).toMatchObject({
      operations: ['command.execute'],
      messageId: 'message-1',
      toolName: 'bash',
    });

    expect(service.reply(conversationId, pendingRequest.id, 'always')).toEqual({
      requestId: pendingRequest.id,
      resolution: 'approved',
    });
    await expect(reviewPromise).resolves.toBeUndefined();

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '再次执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();
    expect(service.listPendingRequests(conversationId)).toEqual([]);
  });

  it('persists always approvals across service instances', async () => {
    const conversationRecordService = new RuntimeHostConversationRecordService();
    const conversationId = (conversationRecordService.createConversation({
      title: 'Persistent Runtime Permission',
    }) as { id: string }).id;
    const firstService = new RuntimeToolPermissionService(conversationRecordService);

    const reviewPromise = firstService.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '执行 bash 命令',
      toolName: 'bash',
    });

    const [pendingRequest] = firstService.listPendingRequests(conversationId);
    firstService.reply(conversationId, pendingRequest.id, 'always');
    await expect(reviewPromise).resolves.toBeUndefined();

    const secondService = new RuntimeToolPermissionService(
      new RuntimeHostConversationRecordService(),
    );

    await expect(secondService.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '再次执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();
    expect(secondService.listPendingRequests(conversationId)).toEqual([]);
  });

  it('rejects unsupported or denied operations', async () => {
    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['network.access'],
      summary: '联网执行命令',
      toolName: 'bash',
    })).rejects.toThrow('不支持能力');

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['network.access'],
      summary: '联网执行命令',
      toolName: 'bash',
    })).rejects.toThrow('权限策略拒绝');
  });

  it('allows ask capabilities directly in yolo mode without creating pending requests', async () => {
    process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE = 'yolo';

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute', 'network.access'],
      summary: '联网执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();

    expect(service.listPendingRequests(conversationId)).toEqual([]);
  });
});
