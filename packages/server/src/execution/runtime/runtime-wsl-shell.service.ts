import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeBackend,
  RuntimeBackendDescriptor,
  RuntimeCommandBackendResult,
  RuntimeCommandRequest,
} from './runtime-command.types';
import { toRuntimeHostPath } from './runtime-host-path';
import {
  isRuntimeHostAbsoluteShellWorkdir,
  readRuntimeShellToolName,
} from './runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';
import {
  readRuntimeWslShellOptions,
  readRuntimeWslShellTimeout,
} from './runtime-wsl-shell-options';
import { RuntimeOneShotShellService } from './runtime-one-shot-shell.service';

@Injectable()
export class RuntimeWslShellService implements RuntimeBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeOneShotShellService: RuntimeOneShotShellService,
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
    const toolName = readRuntimeShellToolName('wsl-shell');
    const rawWorkdir = typeof input.workdir === 'string' ? input.workdir.trim() : '';
    const cwd = isRuntimeHostAbsoluteShellWorkdir('wsl-shell', rawWorkdir)
      ? path.resolve(rawWorkdir)
      : resolveRuntimeVisiblePath(
          session.visibleRoot,
          input.workdir,
          `${toolName}.workdir 必须位于 ${session.visibleRoot} 内`,
        );
    const timeoutMs = readRuntimeWslShellTimeout(input.timeout);
    const hostCwd = isRuntimeHostAbsoluteShellWorkdir('wsl-shell', rawWorkdir)
      ? normalizeWslHostWorkdir(rawWorkdir)
      : toRuntimeHostPath(session.sessionRoot, session.visibleRoot, cwd);
    try {
      const result = await this.runtimeOneShotShellService.execute({
        backendKind: 'wsl-shell',
        command: input.command,
        cwd: hostCwd,
        timeoutMs,
      });
      return {
        backendKind: 'wsl-shell',
        cwd,
        exitCode: result.exitCode,
        sessionId: input.sessionId,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      throw normalizeRuntimeWslShellError(error, timeoutMs);
    }
  }
}

function normalizeRuntimeWslShellError(error: unknown, timeoutMs: number): Error {
  if (error instanceof Error && error.message === 'runtime-one-shot-shell-timeout') {
    return new Error(`bash 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
  }
  return error instanceof Error ? error : new Error('bash 执行失败');
}

function normalizeWslHostWorkdir(workdir: string): string {
  const normalized = workdir.trim();
  const driveMatch = normalized.match(/^\/mnt\/([A-Za-z])(?:\/(.*))?$/u);
  if (!driveMatch) {
    return path.resolve(normalized);
  }
  const drive = driveMatch[1].toUpperCase();
  const rest = (driveMatch[2] ?? '').replace(/\//g, '\\');
  return rest.length > 0 ? `${drive}:\\${rest}` : `${drive}:\\`;
}
