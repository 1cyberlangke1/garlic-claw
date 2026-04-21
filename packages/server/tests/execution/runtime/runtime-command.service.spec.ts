import { RuntimeCommandService } from '../../../src/execution/runtime/runtime-command.service';
import type { RuntimeBackend } from '../../../src/execution/runtime/runtime-command.types';

describe('RuntimeCommandService', () => {
  it('uses the first registered backend as default and supports explicit backend selection', async () => {
    const alphaBackend = createRuntimeBackend('alpha');
    const betaBackend = createRuntimeBackend('beta');
    const service = new RuntimeCommandService([alphaBackend, betaBackend]);

    expect(service.getDefaultBackendKind()).toBe('alpha');
    expect(service.getDefaultBackendDescriptor()).toEqual(alphaBackend.getDescriptor());
    await expect(service.executeCommand({
      command: 'echo default',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      backendKind: 'alpha',
      stdout: 'alpha:echo default',
    }));
    await expect(service.executeCommand({
      backendKind: 'beta',
      command: 'echo explicit',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      backendKind: 'beta',
      stdout: 'beta:echo explicit',
    }));
  });

  it('rejects unknown backend kind', async () => {
    const service = new RuntimeCommandService([createRuntimeBackend('alpha')]);

    await expect(service.executeCommand({
      backendKind: 'missing',
      command: 'echo fail',
      sessionId: 'session-1',
    })).rejects.toThrow('Unknown runtime backend: missing');
    expect(() => service.getBackendDescriptor('missing')).toThrow('Unknown runtime backend: missing');
  });
});

function createRuntimeBackend(kind: string): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/',
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
        visibleRoot: '/',
      };
    },
    getKind() {
      return kind;
    },
  };
}
