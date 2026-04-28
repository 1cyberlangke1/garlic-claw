import { randomUUID } from 'node:crypto';
import {
  type ChildProcessWithoutNullStreams,
  spawn,
} from 'node:child_process';
import path from 'node:path';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { fromRuntimeHostPath } from './runtime-host-path';

const MARKER_PREFIX = '\u001e__GC_DONE__';
const MARKER_SUFFIX = '\u001f';
const SESSION_TIMEOUT_CODE = 'runtime-persistent-shell-timeout';

interface RuntimePersistentShellExecuteInput {
  backendKind: RuntimeBackendKind;
  initialCwd: string;
  initialVisibleCwd: string;
  requestedHostCwd?: string;
  sessionRoot: string;
  sessionId: string;
  shellCommand: string;
  timeoutMs: number;
}

interface RuntimePersistentShellExecuteResult {
  cwd: string;
  exitCode: number;
  reportedCwd: string;
  stderr: string;
  stdout: string;
}

interface RuntimePersistentShellSessionEntry {
  child: ChildProcessWithoutNullStreams;
  currentHostCwd: string;
  currentVisibleCwd: string;
  key: string;
  queue: Promise<void>;
  sessionId: string;
}

interface RuntimePersistentShellCommandState {
  finalize: (result: RuntimePersistentShellExecuteResult) => void;
  reject: (error: Error) => void;
  scanBuffer: string;
  stderr: string;
  stdout: string;
  timeout: NodeJS.Timeout;
}

@Injectable()
export class RuntimePersistentShellSessionService implements OnModuleDestroy {
  private readonly sessions = new Map<string, RuntimePersistentShellSessionEntry>();

  hasActiveSession(sessionId: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.sessionId === sessionId) {
        return true;
      }
    }
    return false;
  }

  async execute(
    input: RuntimePersistentShellExecuteInput,
  ): Promise<RuntimePersistentShellExecuteResult> {
    const session = await this.getOrCreateSession(input);
    const task = session.queue.then(
      () => this.runCommand(session, input),
      () => this.runCommand(session, input),
    );
    session.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async disposeSession(sessionId: string): Promise<void> {
    const closingTasks: Promise<void>[] = [];
    for (const [key, session] of this.sessions.entries()) {
      if (session.sessionId !== sessionId) {
        continue;
      }
      this.sessions.delete(key);
      closingTasks.push(closePersistentShellProcess(session.child));
    }
    await Promise.all(closingTasks);
  }

  async onModuleDestroy(): Promise<void> {
    const closingTasks = [...this.sessions.values()].map((session) =>
      closePersistentShellProcess(session.child),
    );
    this.sessions.clear();
    await Promise.all(closingTasks);
  }

  private async getOrCreateSession(
    input: RuntimePersistentShellExecuteInput,
  ): Promise<RuntimePersistentShellSessionEntry> {
    const key = this.readSessionKey(input.backendKind, input.sessionId);
    const existing = this.sessions.get(key);
    if (existing && !existing.child.killed) {
      return existing;
    }
    const child = await this.spawnShell(input);
    const session: RuntimePersistentShellSessionEntry = {
      child,
      currentHostCwd: input.initialCwd,
      currentVisibleCwd: input.initialVisibleCwd,
      key,
      queue: Promise.resolve(),
      sessionId: input.sessionId,
    };
    child.once('close', () => {
      const current = this.sessions.get(key);
      if (current?.child === child) {
        this.sessions.delete(key);
      }
    });
    this.sessions.set(key, session);
    return session;
  }

  private runCommand(
    session: RuntimePersistentShellSessionEntry,
    input: RuntimePersistentShellExecuteInput,
  ): Promise<RuntimePersistentShellExecuteResult> {
    return new Promise<RuntimePersistentShellExecuteResult>((resolve, reject) => {
      const token = randomUUID();
      const marker = `${MARKER_PREFIX}${token}`;
      const child = session.child;
      const state: RuntimePersistentShellCommandState = {
        finalize: (result) => {
          cleanup();
          session.currentHostCwd = result.reportedCwd;
          session.currentVisibleCwd = result.cwd;
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
        scanBuffer: '',
        stderr: '',
        stdout: '',
        timeout: setTimeout(() => {
          try {
            child.kill();
          } catch {
            // 超时回收持久 shell 进程失败时，只返回超时错误。
          }
          state.reject(new Error(SESSION_TIMEOUT_CODE));
        }, input.timeoutMs),
      };
      const stdoutListener = (chunk: Buffer | string) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        const completed = this.consumeStdoutChunk(
          session,
          marker,
          state,
          text,
          input.backendKind,
          input.sessionRoot,
        );
        if (completed) {
          state.finalize(completed);
        }
      };
      const stderrListener = (chunk: Buffer | string) => {
        state.stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      };
      const errorListener = (error: Error) => {
        this.sessions.delete(session.key);
        state.reject(error);
      };
      const closeListener = () => {
        this.sessions.delete(session.key);
        state.reject(new Error('runtime-persistent-shell-exited'));
      };

      child.stdout.on('data', stdoutListener);
      child.stderr.on('data', stderrListener);
      child.once('error', errorListener);
      child.once('close', closeListener);

      const script = buildPersistentShellCommandEnvelope({
        backendKind: input.backendKind,
        command: input.shellCommand,
        marker,
        workdir: input.requestedHostCwd && input.requestedHostCwd !== session.currentHostCwd
          ? input.requestedHostCwd
          : undefined,
      });
      child.stdin.write(script, 'utf8', (error) => {
        if (!error) {
          return;
        }
        this.sessions.delete(session.key);
        state.reject(error);
      });

      const cleanup = () => {
        clearTimeout(state.timeout);
        child.stdout.off('data', stdoutListener);
        child.stderr.off('data', stderrListener);
        child.off('error', errorListener);
        child.off('close', closeListener);
      };
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'runtime-persistent-shell-exited') {
        throw new Error('持久 shell 会话已退出，请重试当前命令。');
      }
      throw error;
    });
  }

  private consumeStdoutChunk(
    session: RuntimePersistentShellSessionEntry,
    marker: string,
    state: RuntimePersistentShellCommandState,
    text: string,
    backendKind: RuntimeBackendKind,
    sessionRoot: string,
  ): RuntimePersistentShellExecuteResult | null {
    const combined = `${state.scanBuffer}${text}`;
    const startIndex = combined.indexOf(marker);
    if (startIndex < 0) {
      const safeLength = Math.max(0, combined.length - marker.length);
      state.stdout += combined.slice(0, safeLength);
      state.scanBuffer = combined.slice(safeLength);
      return null;
    }
    const endIndex = combined.indexOf(MARKER_SUFFIX, startIndex + marker.length);
    if (endIndex < 0) {
      state.stdout += combined.slice(0, startIndex);
      state.scanBuffer = combined.slice(startIndex);
      return null;
    }
    state.stdout += combined.slice(0, startIndex);
    const payload = combined.slice(startIndex + marker.length, endIndex);
    state.scanBuffer = combined.slice(endIndex + MARKER_SUFFIX.length);
    const [exitCodeText, reportedCwd = session.currentHostCwd] = payload
      .replace(/^\t/u, '')
      .split('\t');
    const exitCode = Number.parseInt(exitCodeText, 10);
    const resolvedCwd = readPersistentShellResolvedCwd({
      backendKind,
      reportedCwd,
      sessionRoot,
    });
    return {
      cwd: resolvedCwd.cwd,
      exitCode: Number.isFinite(exitCode) ? exitCode : 1,
      reportedCwd: resolvedCwd.reportedCwd,
      stderr: normalizePersistentShellOutput(state.stderr),
      stdout: normalizePersistentShellOutput(`${state.stdout}${state.scanBuffer}`),
    };
  }

  private readSessionKey(backendKind: RuntimeBackendKind, sessionId: string): string {
    return `${backendKind}:${sessionId}`;
  }

  private async spawnShell(
    input: RuntimePersistentShellExecuteInput,
  ): Promise<ChildProcessWithoutNullStreams> {
    const candidates = readPersistentShellSpawnCandidates(input);
    let lastError: Error | null = null;
    for (const candidate of candidates) {
      try {
        return await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
          const child = spawn(candidate.command, candidate.args, {
            cwd: candidate.cwd,
            env: process.env,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
          });
          const handleSpawn = () => {
            child.off('error', handleError);
            resolve(child);
          };
          const handleError = (error: Error) => {
            child.off('spawn', handleSpawn);
            reject(error);
          };
          child.once('spawn', handleSpawn);
          child.once('error', handleError);
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error('无法启动持久 shell 会话');
  }
}

function buildPersistentShellCommandEnvelope(input: {
  backendKind: RuntimeBackendKind;
  command: string;
  marker: string;
  workdir?: string;
}): string {
  return usesPersistentPowerShell(input.backendKind)
    ? buildPersistentPowerShellEnvelope(input)
    : buildPersistentBashEnvelope(input);
}

function buildPersistentPowerShellEnvelope(input: {
  command: string;
  marker: string;
  workdir?: string;
}): string {
  const encodedWorkdir = input.workdir
    ? `'${input.workdir.replace(/'/g, "''")}'`
    : '$null';
  const inlineCommand = input.command
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('; ');
  return [
    '$__gc_previous_error_action_preference = $ErrorActionPreference',
    '$ErrorActionPreference = "Stop"',
    '[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)',
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
    'chcp 65001 > $null',
    '$__gc_status = 0',
    '$global:LASTEXITCODE = 0',
    '$__gc_target = ' + encodedWorkdir,
    'try { if ($null -ne $__gc_target) { Set-Location -LiteralPath $__gc_target }; ' + inlineCommand + '; $__gc_status = [int]$LASTEXITCODE } catch { Write-Error $_; $__gc_status = 1 } finally { $ErrorActionPreference = $__gc_previous_error_action_preference }',
    '$__gc_cwd = (Get-Location).Path',
    '[Console]::Out.Write("' + input.marker + '`t$__gc_status`t$__gc_cwd' + MARKER_SUFFIX + '")',
    '',
  ].join('; ') + '\n';
}

function buildPersistentBashEnvelope(input: {
  command: string;
  marker: string;
  workdir?: string;
}): string {
  const escapedWorkdir = input.workdir
    ? `'${input.workdir.replace(/'/g, `'\\''`)}'`
    : '';
  return `${[
    '__gc_status=0',
    input.workdir
      ? `cd -- ${escapedWorkdir} || __gc_status=$?`
      : '',
    'if [ "$__gc_status" -eq 0 ]; then',
    input.command,
    '  __gc_status=$?',
    'fi',
    '__gc_cwd="$(pwd)"',
    `printf '${input.marker}\\t%s\\t%s${MARKER_SUFFIX}' "$__gc_status" "$__gc_cwd"`,
    '',
  ].filter((line) => line.length > 0).join('\n')}\n`;
}

function readPersistentShellSpawnCandidates(
  input: RuntimePersistentShellExecuteInput,
): Array<{ args: string[]; command: string; cwd: string }> {
  if (input.backendKind === 'wsl-shell') {
    return [{
      command: 'wsl.exe',
      args: [
        '--cd',
        toWslPath(input.initialCwd),
        'bash',
        '--noprofile',
        '--norc',
        '-s',
      ],
      cwd: process.cwd(),
    }];
  }
  if (usesPersistentPowerShell(input.backendKind)) {
    return ['powershell.exe', 'pwsh.exe', 'pwsh'].map((command) => ({
      command,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        '-',
      ],
      cwd: input.initialCwd,
    }));
  }
  return [{
    command: 'bash',
    args: ['--noprofile', '--norc', '-s'],
    cwd: input.initialCwd,
  }];
}

function readPersistentShellResolvedCwd(input: {
  backendKind: RuntimeBackendKind;
  reportedCwd: string;
  sessionRoot: string;
}): { cwd: string; reportedCwd: string } {
  if (input.backendKind === 'wsl-shell') {
    const hostPath = fromWslPath(input.reportedCwd);
    if (!hostPath) {
      return { cwd: input.reportedCwd, reportedCwd: input.reportedCwd };
    }
    return {
      cwd: fromRuntimeHostPath(input.sessionRoot, '/', hostPath),
      reportedCwd: hostPath,
    };
  }
  return {
    cwd: fromRuntimeHostPath(input.sessionRoot, '/', input.reportedCwd),
    reportedCwd: input.reportedCwd,
  };
}

function normalizePersistentShellOutput(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function usesPersistentPowerShell(backendKind: RuntimeBackendKind): boolean {
  return process.platform === 'win32'
    && backendKind.includes('native-shell')
    && !backendKind.includes('wsl');
}

function toWslPath(hostPath: string): string {
  const normalized = path.win32.normalize(hostPath);
  const driveMatch = normalized.match(/^([A-Za-z]):\\(.*)$/u);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return normalized.replace(/\\/g, '/');
}

function fromWslPath(wslPath: string): string | null {
  const normalized = wslPath.trim();
  const driveMatch = normalized.match(/^\/mnt\/([A-Za-z])(?:\/(.*))?$/u);
  if (!driveMatch) {
    return null;
  }
  const drive = driveMatch[1].toUpperCase();
  const rest = (driveMatch[2] ?? '').replace(/\//g, '\\');
  return rest.length > 0 ? `${drive}:\\${rest}` : `${drive}:\\`;
}

function closePersistentShellProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise<void>((resolve) => {
    if (
      child.exitCode !== null
      && child.stdin.destroyed
      && child.stdout.destroyed
      && child.stderr.destroyed
    ) {
      resolve();
      return;
    }
    const finalize = () => {
      clearTimeout(fallbackTimer);
      child.off('close', handleClose);
      child.stdin.off('error', handleStdinError);
      resolve();
    };
    const handleClose = () => {
      finalize();
    };
    const handleStdinError = () => {
      child.stdin.off('error', handleStdinError);
    };
    child.once('close', handleClose);
    child.stdin.once('error', handleStdinError);
    try {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) {
        child.stdin.end('exit\n');
      }
    } catch {
      // stdin 已关闭时继续走 kill 兜底。
    }
    const fallbackTimer = setTimeout(() => {
      try {
        if (!child.killed && child.exitCode === null) {
          child.kill();
        }
      } catch {
        // 进程销毁阶段只做尽力处理。
      }
    }, 100);
    fallbackTimer.unref();
  });
}
