import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeHostFilesystemBackendService } from '../../../src/execution/file/runtime-host-filesystem-backend.service';
import { RuntimeFileFreshnessService } from '../../../src/execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../../src/execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';

const runtimeWorkspaceRoots: string[] = [];

describe('RuntimeFileFreshnessService', () => {
  afterEach(() => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('allows creating a new file without a prior read', async () => {
    const { service } = await createFixture();

    await expect(service.assertCanWrite('session-1', 'docs/new-file.txt')).resolves.toBeUndefined();
  });

  it('rejects overwriting an existing file before it has been read', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
      '修改已有文件前必须先读取',
    );
  });

  it('surfaces other recently read files when overwrite is blocked before read', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
        'docs/notes.txt': 'beta\n',
        'docs/todo.md': 'gamma\n',
      },
    });

    await service.rememberRead('session-1', 'docs/notes.txt');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.rememberRead('session-1', 'docs/todo.md');

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
      [
        '修改已有文件前必须先读取: /docs/existing.txt',
        '请先使用 read 工具读取该文件。',
        '本 session 近期还读取过：',
        '- /docs/todo.md',
        '- /docs/notes.txt',
      ].join('\n'),
    );
  });

  it('accepts overwriting an existing file after a fresh read stamp is recorded', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await service.rememberRead('session-1', 'docs/existing.txt');

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).resolves.toBeUndefined();
  });

  it('rejects overwriting when the file changed after the last read', async () => {
    const { service, sessionRoot } = await createFixture({
      initialFiles: {
        'docs/existing.txt': 'alpha\n',
      },
    });

    await service.rememberRead('session-1', 'docs/existing.txt');
    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(path.join(sessionRoot, 'docs', 'existing.txt'), 'beta\n', 'utf8');

    await expect(service.assertCanWrite('session-1', 'docs/existing.txt')).rejects.toThrow(
      '文件在上次读取后已被修改',
    );
  });

  it('serializes writes on the same file path', async () => {
    const { service } = await createFixture();
    const steps: string[] = [];

    const first = service.withFileLock('session-1', '/docs/locked.txt', async () => {
      steps.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      steps.push('first:end');
      return 'first';
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = service.withFileLock('session-1', 'docs/locked.txt', async () => {
      steps.push('second:start');
      steps.push('second:end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(steps).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('does not serialize same virtual path across different sessions', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-file-freshness-sessions-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const runtimeHostFilesystemBackendService = new RuntimeHostFilesystemBackendService(
      runtimeSessionEnvironmentService,
    );
    const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([
      runtimeHostFilesystemBackendService,
    ]);
    const service = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
    const steps: string[] = [];

    const first = service.withFileLock('session-a', '/docs/locked.txt', async () => {
      steps.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      steps.push('first:end');
      return 'first';
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = service.withFileLock('session-b', '/docs/locked.txt', async () => {
      steps.push('second:start');
      steps.push('second:end');
      return 'second';
    });

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(steps).toEqual(['first:start', 'second:start', 'second:end', 'first:end']);
  });

  it('lists recent reads in reverse chronological order and supports exclude/limit', async () => {
    const { service } = await createFixture({
      initialFiles: {
        'docs/a.txt': 'alpha\n',
        'docs/b.txt': 'beta\n',
        'docs/c.txt': 'gamma\n',
      },
    });

    await service.rememberRead('session-1', 'docs/a.txt');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.rememberRead('session-1', 'docs/b.txt');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.rememberRead('session-1', 'docs/c.txt');

    expect(service.listRecentReads('session-1')).toEqual([
      '/docs/c.txt',
      '/docs/b.txt',
      '/docs/a.txt',
    ]);
    expect(service.listRecentReads('session-1', {
      excludePath: '/docs/c.txt',
      limit: 1,
    })).toEqual(['/docs/b.txt']);
  });
});

async function createFixture(input?: {
  initialFiles?: Record<string, string>;
}) {
  const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-file-freshness-'));
  runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
  process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

  const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
  const runtimeHostFilesystemBackendService = new RuntimeHostFilesystemBackendService(
    runtimeSessionEnvironmentService,
  );
  const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([
    runtimeHostFilesystemBackendService,
  ]);
  const service = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
  const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-1');

  for (const [relativePath, content] of Object.entries(input?.initialFiles ?? {})) {
    const hostPath = path.join(sessionEnvironment.sessionRoot, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(hostPath), { recursive: true });
    fs.writeFileSync(hostPath, content, 'utf8');
  }

  return {
    service,
    sessionRoot: sessionEnvironment.sessionRoot,
  };
}
