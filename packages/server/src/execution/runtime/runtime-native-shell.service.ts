import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeBackend,
  RuntimeBackendDescriptor,
  RuntimeCommandBackendResult,
  RuntimeCommandRequest,
} from './runtime-command.types';
import { readRuntimeNativeShellOptions, readRuntimeNativeShellTimeout } from './runtime-native-shell-options';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { toRuntimeHostPath } from './runtime-host-path';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';

const RUNTIME_NATIVE_SHELL_TIMEOUT_CODE = 'runtime-native-shell-timeout';

@Injectable()
export class RuntimeNativeShellService implements RuntimeBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
  ) {}

  getDescriptor(): RuntimeBackendDescriptor {
    return readRuntimeNativeShellOptions().descriptor;
  }

  getKind(): 'native-shell' {
    return 'native-shell';
  }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandBackendResult> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      input.sessionId,
    );
    const cwd = resolveRuntimeVisiblePath(
      sessionEnvironment.visibleRoot,
      input.workdir,
      `bash.workdir 必须位于 ${sessionEnvironment.visibleRoot} 内`,
    );
    const timeoutMs = readRuntimeNativeShellTimeout(input.timeout);
    const hostCwd = toRuntimeHostPath(sessionEnvironment.sessionRoot, sessionEnvironment.visibleRoot, cwd);
    try {
      const result = await executeRuntimeNativeShellCommand({
        command: input.command,
        cwd: hostCwd,
        timeoutMs,
      });
      return {
        backendKind: 'native-shell',
        cwd,
        exitCode: result.exitCode,
        sessionId: input.sessionId,
        stderr: normalizeRuntimeNativeShellOutput(result.stderr),
        stdout: normalizeRuntimeNativeShellOutput(result.stdout),
      };
    } catch (error) {
      throw normalizeRuntimeNativeShellError(error, timeoutMs);
    }
  }
}

function executeRuntimeNativeShellCommand(
  input: {
    command: string;
    cwd: string;
    timeoutMs: number;
  },
): Promise<{
    exitCode: number;
    stderr: string;
    stdout: string;
  }> {
  return new Promise((resolve, reject) => {
    const shell = readRuntimeNativeShellProcess();
    const child = spawn(shell.command, shell.args(input.command), {
      cwd: input.cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, input.timeoutMs);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(RUNTIME_NATIVE_SHELL_TIMEOUT_CODE));
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      });
    });
  });
}

function readRuntimeNativeShellProcess(): {
  args: (command: string) => string[];
  command: string;
} {
  if (process.platform === 'win32') {
    return {
      args: (command) => [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        readRuntimeNativePowerShellCommand(command),
      ],
      command: 'powershell.exe',
    };
  }
  return {
    args: (command) => ['-lc', command],
    command: 'bash',
  };
}

function readRuntimeNativePowerShellCommand(command: string): string {
  return [
    '[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)',
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
    'chcp 65001 > $null',
    command,
  ].join('; ');
}

function normalizeRuntimeNativeShellOutput(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function normalizeRuntimeNativeShellError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && error.message === RUNTIME_NATIVE_SHELL_TIMEOUT_CODE) {
    return new Error(
      `bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`,
    );
  }
  return error instanceof Error ? error : new Error('bash 执行失败');
}
