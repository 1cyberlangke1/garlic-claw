import { Bash } from 'just-bash';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { RuntimeBackend, RuntimeBackendDescriptor, RuntimeCommandRequest, RuntimeCommandResult } from './runtime-command.types';
import { RuntimeWorkspaceService } from './runtime-workspace.service';
import { RuntimeMountedWorkspaceFileSystem } from './runtime-mounted-workspace-file-system';
import { readRuntimeJustBashOptions, readRuntimeJustBashTimeout } from './runtime-just-bash-options';

const RUNTIME_BASH_TIMEOUT_CODE = 'runtime-bash-timeout';

@Injectable()
export class RuntimeJustBashService implements RuntimeBackend {
  constructor(private readonly runtimeWorkspaceService: RuntimeWorkspaceService) {}

  getDescriptor(): RuntimeBackendDescriptor {
    return readRuntimeJustBashOptions().descriptor;
  }

  getKind(): 'just-bash' {
    return 'just-bash';
  }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandResult> {
    const options = readRuntimeJustBashOptions();
    const workspaceRoot = await this.runtimeWorkspaceService.resolveWorkspaceRoot(input.sessionId);
    const visibleRoot = this.runtimeWorkspaceService.getVisibleRoot();
    const filesystem = new RuntimeMountedWorkspaceFileSystem(workspaceRoot, visibleRoot);
    const bash = new Bash({
      cwd: visibleRoot,
      fs: filesystem,
      network: {
        dangerouslyAllowFullInternetAccess: options.descriptor.capabilities.networkAccess,
      },
    });

    const cwd = resolveRuntimeWorkingDirectory(visibleRoot, input.workdir);
    const timeoutMs = readRuntimeJustBashTimeout(input.timeout);
    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | null = null;

    let commandError: unknown = null;
    let result:
      | {
          exitCode: number;
          stderr: string;
          stdout: string;
        }
      | null = null;
    try {
      result = await executeRuntimeBashCommandWithTimeout(bash, {
        command: input.command,
        controller,
        cwd,
        onTimerCreated: (handle) => {
          timeoutHandle = handle;
        },
        timeoutMs,
      });
    } catch (error) {
      commandError = error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }

    if (commandError) {
      throw normalizeRuntimeBashError(commandError, timeoutMs);
    }
    if (!result) {
      throw new Error('bash 执行结果缺失');
    }
    return {
      backendKind: 'just-bash',
      cwd,
      exitCode: result.exitCode,
      sessionId: input.sessionId,
      stderr: result.stderr,
      stdout: result.stdout,
      workspaceRoot,
    };
  }
}

function normalizeRuntimeBashError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && error.message === RUNTIME_BASH_TIMEOUT_CODE) {
    return new Error(`bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）`);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new Error(`bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）`);
  }
  return error instanceof Error ? error : new Error('bash 执行失败');
}

async function executeRuntimeBashCommandWithTimeout(
  bash: Bash,
  input: {
    command: string;
    controller: AbortController;
    cwd: string;
    onTimerCreated: (handle: NodeJS.Timeout) => void;
    timeoutMs: number;
  },
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> {
  let timedOut = false;
  const executionPromise = bash.exec(input.command, {
    cwd: input.cwd,
    signal: input.controller.signal,
  }).catch((error: unknown) => {
    if (timedOut) {
      throw new Error(RUNTIME_BASH_TIMEOUT_CODE);
    }
    throw error;
  });
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    const handle = setTimeout(() => {
      timedOut = true;
      input.controller.abort();
      reject(new Error(RUNTIME_BASH_TIMEOUT_CODE));
    }, input.timeoutMs);
    input.onTimerCreated(handle);
  });
  return Promise.race([executionPromise, timeoutPromise]);
}

function resolveRuntimeWorkingDirectory(workspaceRoot: string, inputWorkdir?: string): string {
  if (!inputWorkdir || !inputWorkdir.trim()) {
    return workspaceRoot;
  }
  const normalized = inputWorkdir.trim().startsWith('/')
    ? normalizePosixPath(inputWorkdir.trim())
    : normalizePosixPath(`${workspaceRoot}/${inputWorkdir.trim()}`);
  if (workspaceRoot !== '/' && normalized !== workspaceRoot && !normalized.startsWith(`${workspaceRoot}/`)) {
    throw new BadRequestException(`bash.workdir 必须位于 ${workspaceRoot} 内`);
  }
  return normalized;
}

function normalizePosixPath(input: string): string {
  const parts = input.split('/').filter((entry) => entry.length > 0 && entry !== '.');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join('/')}`;
}
