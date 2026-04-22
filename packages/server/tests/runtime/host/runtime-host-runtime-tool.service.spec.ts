import { RuntimeHostRuntimeToolService } from '../../../src/runtime/host/runtime-host-runtime-tool.service';

describe('RuntimeHostRuntimeToolService', () => {
  it('reuses one filesystem backend kind across access review and tool execution', async () => {
    const readToolService = {
      execute: jest.fn().mockResolvedValue({ output: '<read_result />' }),
      getToolName: () => 'read',
      readInput: jest.fn((_params, sessionId, backendKind) => ({
        backendKind,
        filePath: 'docs/readme.md',
        sessionId,
      })),
      readRuntimeAccess: jest.fn((input) => ({
        backendKind: input.backendKind,
        requiredOperations: ['file.read'],
        role: 'filesystem',
        summary: `读取路径 ${input.filePath}`,
      })),
    };
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'mock-filesystem',
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'deny',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getFilesystemBackendKind: jest.fn().mockReturnValue('mock-filesystem'),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RuntimeHostRuntimeToolService(
      {} as never,
      readToolService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
    );

    await expect(service.readPath({
      conversationId: 'conversation-1',
      metadata: {
        assistantMessageId: 'assistant-message-1',
      },
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      filePath: 'docs/readme.md',
    } as never)).resolves.toEqual({ output: '<read_result />' });

    expect(runtimeToolBackendService.getFilesystemBackendKind).toHaveBeenCalledTimes(1);
    expect(readToolService.readInput).toHaveBeenCalledWith(
      { filePath: 'docs/readme.md' },
      'conversation-1',
      'mock-filesystem',
    );
    expect(readToolService.readRuntimeAccess).toHaveBeenCalledWith({
      backendKind: 'mock-filesystem',
      filePath: 'docs/readme.md',
      sessionId: 'conversation-1',
    });
    expect(runtimeToolBackendService.getBackendDescriptor).toHaveBeenCalledWith('filesystem', 'mock-filesystem');
    expect(runtimeToolPermissionService.review).toHaveBeenCalledWith(expect.objectContaining({
      backend: expect.objectContaining({
        kind: 'mock-filesystem',
      }),
      conversationId: 'conversation-1',
      messageId: 'assistant-message-1',
      requiredOperations: ['file.read'],
      toolName: 'read',
    }));
    expect(readToolService.execute).toHaveBeenCalledWith({
      backendKind: 'mock-filesystem',
      filePath: 'docs/readme.md',
      sessionId: 'conversation-1',
    });
  });

  it('reuses one shell backend kind across access review and command execution', async () => {
    const bashToolService = {
      execute: jest.fn().mockResolvedValue({ cwd: '/', exitCode: 0, stderr: '', stdout: 'ok' }),
      getToolName: () => 'bash',
      readInput: jest.fn((_params, sessionId, backendKind) => ({
        backendKind,
        command: 'pwd',
        description: '打印当前目录',
        sessionId,
      })),
      readRuntimeAccess: jest.fn((input) => ({
        backendKind: input.backendKind,
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: input.description,
      })),
    };
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'mock-shell',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getShellBackendKind: jest.fn().mockReturnValue('mock-shell'),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RuntimeHostRuntimeToolService(
      bashToolService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
    );

    await expect(service.executeCommand({
      conversationId: 'conversation-2',
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      command: 'pwd',
      description: '打印当前目录',
    } as never)).resolves.toEqual({ cwd: '/', exitCode: 0, stderr: '', stdout: 'ok' });

    expect(runtimeToolBackendService.getShellBackendKind).toHaveBeenCalledTimes(1);
    expect(bashToolService.readInput).toHaveBeenCalledWith(
      { command: 'pwd', description: '打印当前目录' },
      'conversation-2',
      'mock-shell',
    );
    expect(runtimeToolBackendService.getBackendDescriptor).toHaveBeenCalledWith('shell', 'mock-shell');
    expect(runtimeToolPermissionService.review).toHaveBeenCalledWith(expect.objectContaining({
      backend: expect.objectContaining({
        kind: 'mock-shell',
      }),
      conversationId: 'conversation-2',
      requiredOperations: ['command.execute'],
      toolName: 'bash',
    }));
    expect(bashToolService.execute).toHaveBeenCalledWith({
      backendKind: 'mock-shell',
      command: 'pwd',
      description: '打印当前目录',
      sessionId: 'conversation-2',
    });
  });
});
