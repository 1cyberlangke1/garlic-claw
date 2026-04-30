import { Bash } from 'just-bash';
import { Injectable } from '@nestjs/common';
import type { RuntimeBackend, RuntimeBackendDescriptor, RuntimeCommandBackendResult, RuntimeCommandRequest } from './runtime-command.types';
import { RuntimeMountedWorkspaceFileSystem } from './runtime-mounted-workspace-file-system';
import { readRuntimeJustBashOptions, readRuntimeJustBashTimeout } from './runtime-just-bash-options';
import { readRuntimeShellToolName } from './runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';

const RUNTIME_BASH_TIMEOUT_CODE = 'runtime-bash-timeout';

@Injectable()
export class RuntimeJustBashService implements RuntimeBackend {
  constructor(private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService) {}
  getDescriptor(): RuntimeBackendDescriptor { return readRuntimeJustBashOptions().descriptor; }
  getKind(): 'just-bash' { return 'just-bash'; }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandBackendResult> {
    const toolName = readRuntimeShellToolName('just-bash');
    const options = readRuntimeJustBashOptions(), session = await this.runtimeSessionEnvironmentService.getSessionEnvironment(input.sessionId), cwd = resolveRuntimeVisiblePath(session.visibleRoot, input.workdir, `${toolName}.workdir 必须位于 ${session.visibleRoot} 内`), timeoutMs = readRuntimeJustBashTimeout(input.timeout);
    try {
      const result = await executeRuntimeBashWithTimeout(new Bash({ cwd: session.visibleRoot, fs: new RuntimeMountedWorkspaceFileSystem(session.sessionRoot, session.visibleRoot), network: { dangerouslyAllowFullInternetAccess: options.descriptor.capabilities.networkAccess } }), input.command, cwd, timeoutMs);
      return { backendKind: 'just-bash', cwd, exitCode: result.exitCode, sessionId: input.sessionId, stderr: result.stderr, stdout: result.stdout };
    } catch (error) {
      throw normalizeRuntimeBashError(error, timeoutMs);
    }
  }
}

async function executeRuntimeBashWithTimeout(bash: Bash, command: string, cwd: string, timeoutMs: number): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    const executionPromise = bash.exec(command, { cwd, signal: controller.signal }).catch((error: unknown) => {
      throw timedOut ? new Error(RUNTIME_BASH_TIMEOUT_CODE) : error;
    });
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(RUNTIME_BASH_TIMEOUT_CODE));
      }, timeoutMs);
      timeoutHandle.unref();
    });
    return await Promise.race([executionPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeRuntimeBashError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && (error.message === RUNTIME_BASH_TIMEOUT_CODE || error.name === 'AbortError')) {
    return new Error(`bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
  }
  return error instanceof Error ? error : new Error('bash 执行失败');
}
