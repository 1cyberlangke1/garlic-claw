import { spawn } from 'node:child_process';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeBackend,
  RuntimeBackendDescriptor,
  RuntimeCommandBackendResult,
  RuntimeCommandRequest,
} from './runtime-command.types';
import { toRuntimeHostPath } from './runtime-host-path';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';
import {
  readRuntimeWslShellOptions,
  readRuntimeWslShellTimeout,
} from './runtime-wsl-shell-options';

const RUNTIME_WSL_SHELL_TIMEOUT_CODE = 'runtime-wsl-shell-timeout';

@Injectable()
export class RuntimeWslShellService implements RuntimeBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
  ) {}

  getDescriptor(): RuntimeBackendDescriptor {
    return readRuntimeWslShellOptions().descriptor;
  }

  getKind(): 'wsl-shell' {
    return 'wsl-shell';
  }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandBackendResult> {
    if (process.platform !== 'win32') {
      throw new Error('wsl-shell 只支持 Windows 宿主');
    }
    const session = await this.runtimeSessionEnvironmentService.getSessionEnvironment(input.sessionId);
    const cwd = resolveRuntimeVisiblePath(
      session.visibleRoot,
      input.workdir,
      `bash.workdir 必须位于 ${session.visibleRoot} 内`,
    );
    const timeoutMs = readRuntimeWslShellTimeout(input.timeout);
    const hostCwd = toRuntimeHostPath(session.sessionRoot, session.visibleRoot, cwd);
    try {
      const result = await executeRuntimeWslShell({
        command: input.command,
        cwd: toRuntimeWslPath(hostCwd),
        timeoutMs,
      });
      return {
        backendKind: 'wsl-shell',
        cwd,
        exitCode: result.exitCode,
        sessionId: input.sessionId,
        stderr: normalizeRuntimeWslShellOutput(result.stderr),
        stdout: normalizeRuntimeWslShellOutput(result.stdout),
      };
    } catch (error) {
      throw normalizeRuntimeWslShellError(error, timeoutMs);
    }
  }
}

function executeRuntimeWslShell(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['--cd', input.cwd, 'bash', '-lc', input.command], {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, input.timeoutMs);
    child.stdout.on('data', (chunk: Buffer | string) => stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer | string) => stderr.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.once('error', (error) => finish(() => reject(error)));
    child.once('close', (code) => finish(() => timedOut
      ? reject(new Error(RUNTIME_WSL_SHELL_TIMEOUT_CODE))
      : resolve({
          exitCode: code ?? 1,
          stderr: Buffer.concat(stderr).toString('utf8'),
          stdout: Buffer.concat(stdout).toString('utf8'),
        })));

    function finish(callback: () => void): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    }
  });
}

function toRuntimeWslPath(hostPath: string): string {
  const normalized = path.win32.normalize(hostPath);
  const driveMatch = normalized.match(/^([A-Za-z]):\\(.*)$/u);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return normalized.replace(/\\/g, '/');
}

function normalizeRuntimeWslShellOutput(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function normalizeRuntimeWslShellError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && error.message === RUNTIME_WSL_SHELL_TIMEOUT_CODE) {
    return new Error(`bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
  }
  return error instanceof Error ? error : new Error('bash 执行失败');
}
