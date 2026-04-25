import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

let child: ChildProcessWithoutNullStreams | null = null;
let shuttingDown = false;

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    process.exitCode = 1;
    return;
  }
  try {
    const target = resolveLaunchTarget(command, args);
    child = spawn(target.command, target.args, {
      env: process.env,
      shell: false,
      stdio: 'pipe',
      windowsHide: true,
    });
    pipeProcessStreams();
    bindShutdownSignals();
    child.once('error', (error) => failMcpLaunch(error, 1));
    child.once('exit', (code, signal) => process.exit(shuttingDown ? code ?? 0 : code ?? (signal ? 1 : 0)));
  } catch (error) {
    failMcpLaunch(error, 1);
  }
}

export function resolveLaunchTarget(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32' || (command !== 'npm' && command !== 'npx')) {
    return { command, args: [...args] };
  }
  return {
    command: process.execPath,
    args: [resolveBundledNpmCli(command), ...args],
  };
}

function pipeProcessStreams(): void {
  if (!child) {
    return;
  }
  process.stdin.on('data', (chunk) => {
    if (!child || shuttingDown || child.stdin.write(chunk)) {
      return;
    }
    process.stdin.pause();
  });
  process.stdin.on('end', () => child?.stdin.end());
  process.stdin.on('error', () => shutdown(0));
  child.stdin.on('drain', () => process.stdin.resume());
  forwardStream(child.stdout, process.stdout);
  forwardStream(child.stderr, process.stderr);
  process.stdout.on('error', handleStreamError);
  process.stderr.on('error', handleStreamError);
}

function forwardStream(readable: NodeJS.ReadableStream, writable: NodeJS.WritableStream): void {
  readable.on('data', (chunk) => {
    if (shuttingDown || writable.write(chunk)) {
      return;
    }
    if (typeof readable.pause === 'function') {
      readable.pause();
    }
  });
  readable.on('error', () => shutdown(0));
  writable.on('drain', () => {
    if (typeof readable.resume === 'function') {
      readable.resume();
    }
  });
}

function bindShutdownSignals(): void {
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('disconnect', () => shutdown(0));
}

function handleStreamError(error: Error & { code?: string }): void {
  shutdown(error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED' ? 0 : 1);
}

function shutdown(exitCode: number, signal?: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stdout.off('error', handleStreamError);
  process.stderr.off('error', handleStreamError);
  if (child && !child.killed) {
    child.kill(signal);
    setTimeout(() => child && !child.killed && child.kill('SIGKILL'), 1000).unref();
  }
  process.exit(exitCode);
}

function failMcpLaunch(error: unknown, exitCode: number): void {
  try {
    process.stderr.write(`MCP stdio launcher failed: ${error instanceof Error ? error.message : String(error)}\n`);
  } catch {
    // ignore stderr write failure during shutdown
  }
  shutdown(exitCode);
}

function resolveBundledNpmCli(command: 'npm' | 'npx'): string {
  const cliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', command === 'npx' ? 'npx-cli.js' : 'npm-cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error(`无法解析 ${command} CLI 入口: ${cliPath}`);
  }
  return cliPath;
}

if (require.main === module) {
  main();
}
