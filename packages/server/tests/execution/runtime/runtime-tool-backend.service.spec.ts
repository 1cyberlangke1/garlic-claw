import { RuntimeCommandService } from '../../../src/execution/runtime/runtime-command.service';
import type { RuntimeBackend } from '../../../src/execution/runtime/runtime-command.types';
import { RuntimeToolBackendService } from '../../../src/execution/runtime/runtime-tool-backend.service';
import { RuntimeWorkspaceBackendService } from '../../../src/execution/runtime/runtime-workspace-backend.service';
import type { RuntimeWorkspaceBackend } from '../../../src/execution/runtime/runtime-workspace-backend.types';

describe('RuntimeToolBackendService', () => {
  const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
  const originalWorkspaceBackend = process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND;

  afterEach(() => {
    if (originalShellBackend === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
    }
    if (originalWorkspaceBackend === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND = originalWorkspaceBackend;
    }
  });

  it('uses default backend for shell and workspace when no routing override is configured', () => {
    delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND;
    const service = new RuntimeToolBackendService(
      new RuntimeCommandService([
        createRuntimeBackend('alpha'),
        createRuntimeBackend('beta'),
      ]),
      new RuntimeWorkspaceBackendService([
        createWorkspaceBackend('alpha-workspace'),
        createWorkspaceBackend('beta-workspace'),
      ]),
    );

    expect(service.getShellBackendKind()).toBe('alpha');
    expect(service.getWorkspaceBackendKind()).toBe('alpha-workspace');
  });

  it('supports independent shell and workspace backend routing', () => {
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'beta';
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND = 'alpha-workspace';
    const service = new RuntimeToolBackendService(
      new RuntimeCommandService([
        createRuntimeBackend('alpha'),
        createRuntimeBackend('beta'),
      ]),
      new RuntimeWorkspaceBackendService([
        createWorkspaceBackend('alpha-workspace'),
        createWorkspaceBackend('beta-workspace'),
      ]),
    );

    expect(service.getShellBackendKind()).toBe('beta');
    expect(service.getWorkspaceBackendKind()).toBe('alpha-workspace');
    expect(service.getBackendKind('shell')).toBe('beta');
    expect(service.getBackendKind('workspace')).toBe('alpha-workspace');
  });

  it('rejects unknown configured backend kind', () => {
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'missing';
    const service = new RuntimeToolBackendService(
      new RuntimeCommandService([createRuntimeBackend('alpha')]),
      new RuntimeWorkspaceBackendService([createWorkspaceBackend('alpha-workspace')]),
    );

    expect(() => service.getShellBackendDescriptor()).toThrow(
      'Unknown runtime shell backend: missing',
    );
  });

  it('rejects unknown configured workspace backend kind', () => {
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACE_BACKEND = 'missing-workspace';
    const service = new RuntimeToolBackendService(
      new RuntimeCommandService([createRuntimeBackend('alpha')]),
      new RuntimeWorkspaceBackendService([createWorkspaceBackend('alpha-workspace')]),
    );

    expect(() => service.getWorkspaceBackendDescriptor()).toThrow(
      'Unknown runtime workspace backend: missing-workspace',
    );
  });
});

function createRuntimeBackend(kind: string): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/workspace',
        exitCode: 0,
        sessionId: input.sessionId,
        stderr: '',
        stdout: `${kind}:${input.command}`,
        workspaceRoot: '/tmp/workspace',
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      };
    },
    getKind() {
      return kind;
    },
  };
}

function createWorkspaceBackend(kind: string): RuntimeWorkspaceBackend {
  return {
    async editTextFile() {
      return {
        occurrences: 1,
        path: '/workspace/mock.txt',
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'deny',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      };
    },
    getKind() {
      return kind;
    },
    getVirtualWorkspaceRoot() {
      return '/workspace';
    },
    async listFiles() {
      return {
        basePath: '/workspace',
        files: [],
      };
    },
    async readDirectoryEntries() {
      return {
        entries: [],
        path: '/workspace',
      };
    },
    async readExistingPath() {
      return {
        exists: true,
        hostPath: '/tmp/mock.txt',
        type: 'file' as const,
        virtualPath: '/workspace/mock.txt',
        workspaceRoot: '/tmp',
      };
    },
    async readTextFile() {
      return {
        content: 'mock',
        path: '/workspace/mock.txt',
      };
    },
    async writeTextFile() {
      return {
        created: true,
        path: '/workspace/mock.txt',
      };
    },
  };
}
