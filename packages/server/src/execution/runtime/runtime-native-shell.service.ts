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
import { RuntimePersistentShellSessionService } from './runtime-persistent-shell-session.service';
import { toRuntimeHostPath } from './runtime-host-path';
import {
  isRuntimeHostAbsoluteShellWorkdir,
  readRuntimeShellToolName,
} from './runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';

@Injectable()
export class RuntimeNativeShellService implements RuntimeBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimePersistentShellSessionService: RuntimePersistentShellSessionService,
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
      const result = await this.runtimePersistentShellSessionService.execute({
        backendKind: 'native-shell',
        initialCwd: hostCwd,
        initialVisibleCwd: cwd,
        requestedHostCwd: rawWorkdir.length > 0 ? hostCwd : undefined,
        sessionRoot: session.sessionRoot,
        sessionId: input.sessionId,
        shellCommand: input.command,
        timeoutMs,
      });
      return {
        backendKind: 'native-shell',
        cwd: result.cwd,
        exitCode: result.exitCode,
        sessionId: input.sessionId,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      throw normalizeRuntimeNativeShellError(error, timeoutMs);
    }
  }
}

function normalizeRuntimeNativeShellError(error: unknown, timeoutMs: number): Error {
  const toolName = process.platform === 'win32' ? 'powershell' : 'bash';
  if (error instanceof Error && error.message === 'runtime-persistent-shell-timeout') {
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
