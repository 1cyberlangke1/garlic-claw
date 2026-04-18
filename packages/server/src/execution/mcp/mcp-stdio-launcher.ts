import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

let child: ChildProcessWithoutNullStreams | null = null;
let shuttingDown = false;

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    process.exitCode = 1;
    return;
  }

  child = spawn(command, args, {
    env: process.env,
    shell: false,
    stdio: 'pipe',
    windowsHide: true,
  });

  bindParentInput();
  bindChildOutput();
  bindSignals();

  child.once('error', () => {
    shutdown(1);
  });
  child.once('exit', (code, signal) => {
    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function bindParentInput(): void {
  if (!child) {
    return;
  }

  process.stdin.on('data', (chunk) => {
    if (!child || shuttingDown) {
      return;
    }
    if (!child.stdin.write(chunk)) {
      process.stdin.pause();
    }
  });
  child.stdin.on('drain', () => process.stdin.resume());
  process.stdin.on('end', () => {
    child?.stdin.end();
  });
  process.stdin.on('error', () => {
    shutdown(0);
  });
}

function bindChildOutput(): void {
  if (!child) {
    return;
  }

  forwardReadableToWritable(child.stdout, process.stdout);
  forwardReadableToWritable(child.stderr, process.stderr);
  process.stdout.on('error', handleWritableError);
  process.stderr.on('error', handleWritableError);
}

function bindSignals(): void {
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('disconnect', () => shutdown(0));
}

function forwardReadableToWritable(
  readable: NodeJS.ReadableStream,
  writable: NodeJS.WritableStream,
): void {
  readable.on('data', (chunk) => {
    if (shuttingDown) {
      return;
    }
    const accepted = writable.write(chunk);
    if (!accepted && 'pause' in readable && typeof readable.pause === 'function') {
      readable.pause();
    }
  });
  writable.on('drain', () => {
    if ('resume' in readable && typeof readable.resume === 'function') {
      readable.resume();
    }
  });
  readable.on('error', () => {
    shutdown(0);
  });
}

function handleWritableError(error: Error & { code?: string }): void {
  if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
    shutdown(0);
    return;
  }
  shutdown(1);
}

function shutdown(exitCode: number, signal?: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  process.stdout.off('error', handleWritableError);
  process.stderr.off('error', handleWritableError);

  if (child && !child.killed) {
    if (signal) {
      child.kill(signal);
    } else {
      child.kill();
    }
    setTimeout(() => {
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 1000).unref();
  }

  process.exit(exitCode);
}

main();
