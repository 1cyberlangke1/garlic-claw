import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeBackend,
  RuntimeBackendDescriptor,
  RuntimeCommandBackendResult,
  RuntimeCommandRequest,
} from './runtime-command.types';
import {
  readRuntimeNativeShellOptions,
  readRuntimeNativeShellTimeout,
} from './runtime-native-shell-options';
import { toRuntimeHostPath } from './runtime-host-path';
import {
  isRuntimeHostAbsoluteShellWorkdir,
  readRuntimeShellToolName,
} from './runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
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
    const session = await this.runtimeSessionEnvironmentService.getSessionEnvironment(input.sessionId);
    const toolName = readRuntimeShellToolName('native-shell');
    const rawWorkdir = typeof input.workdir === 'string' ? input.workdir.trim() : '';
    const cwd = isRuntimeHostAbsoluteShellWorkdir('native-shell', rawWorkdir)
      ? path.resolve(rawWorkdir)
      : resolveRuntimeVisiblePath(
          session.visibleRoot,
          input.workdir,
          `${toolName}.workdir 必须位于 ${session.visibleRoot} 内`,
        );
    const hostCwd = isRuntimeHostAbsoluteShellWorkdir('native-shell', rawWorkdir)
      ? path.resolve(rawWorkdir)
      : toRuntimeHostPath(session.sessionRoot, session.visibleRoot, cwd);
    if (!fs.existsSync(hostCwd)) {
      throw new Error(`${toolName}.workdir 不存在: ${cwd}`);
    }
    const timeoutMs = readRuntimeNativeShellTimeout(input.timeout);
    try {
      const result = await executeRuntimeNativeShell({
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

function executeRuntimeNativeShell(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
}): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return runRuntimeNativeShellCandidates(readRuntimeNativeShellProcesses(input.command), input);
}

async function runRuntimeNativeShellCandidates(
  candidates: Array<{ args: string[]; command: string }>,
  input: { command: string; cwd: string; timeoutMs: number },
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  let lastSpawnError: Error | null = null;
  for (const candidate of candidates) {
    try {
      return await executeRuntimeNativeShellProcess(candidate, input);
    } catch (error) {
      if (isRuntimeShellSpawnMissing(error)) {
        lastSpawnError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastSpawnError ?? new Error('bash 执行失败');
}

function executeRuntimeNativeShellProcess(
  shell: { args: string[]; command: string },
  input: { command: string; cwd: string; timeoutMs: number },
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(shell.command, shell.args, {
      cwd: input.cwd,
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
      ? reject(new Error(RUNTIME_NATIVE_SHELL_TIMEOUT_CODE))
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

function readRuntimeNativeShellProcesses(command: string): Array<{ args: string[]; command: string }> {
  if (process.platform === 'win32') {
    return ['powershell.exe', 'pwsh.exe', 'pwsh'].map((shellCommand) => ({
      command: shellCommand,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        [
          '[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)',
          '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
          'chcp 65001 > $null',
          command,
        ].join('; '),
      ],
    }));
  }
  return [{ command: 'bash', args: ['-lc', command] }];
}

function normalizeRuntimeNativeShellOutput(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function normalizeRuntimeNativeShellError(error: unknown, timeoutMs: number): Error {
  const toolName = process.platform === 'win32' ? 'powershell' : 'bash';
  if (error instanceof Error && error.message === RUNTIME_NATIVE_SHELL_TIMEOUT_CODE) {
    return new Error(`${toolName} 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
  }
  if (isRuntimeShellSpawnMissing(error)) {
    return new Error('native-shell 缺少可用的 PowerShell 可执行文件，请改用 just-bash / WSL，或安装并暴露 powershell.exe / pwsh.exe 到 PATH。');
  }
  return error instanceof Error ? error : new Error(`${toolName} 执行失败`);
}

function isRuntimeShellSpawnMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}
