import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeHostFilesystemBackendService } from '../../../src/execution/file/runtime-host-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';

describe('RuntimeHostFilesystemBackendService', () => {
  const originalWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
  const runtimeWorkspaceRoots: string[] = [];

  afterEach(() => {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalWorkspaceRoot;
    }
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (!nextRoot) {
        continue;
      }
      fs.rmSync(nextRoot, { force: true, recursive: true });
    }
  });

  it('supports resolve, stat, directory, copy, move, delete and symlink operations', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-workspace-file-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-1');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'source.txt'),
      'source\n',
      'utf8',
    );

    await expect(service.resolvePath('session-1', 'docs/source.txt')).resolves.toEqual(
      expect.objectContaining({
        exists: true,
        type: 'file',
        virtualPath: '/docs/source.txt',
      }),
    );
    await expect(service.statPath('session-1', 'docs/source.txt')).resolves.toEqual(
      expect.objectContaining({
        exists: true,
        size: 7,
        type: 'file',
        virtualPath: '/docs/source.txt',
      }),
    );
    await expect(service.ensureDirectory('session-1', 'logs/archive')).resolves.toEqual({
      created: true,
      path: '/logs/archive',
    });
    await expect(service.ensureDirectory('session-1', 'logs/archive')).resolves.toEqual({
      created: false,
      path: '/logs/archive',
    });
    await expect(
      service.copyPath('session-1', 'docs/source.txt', 'logs/archive/copied.txt'),
    ).resolves.toEqual({
      fromPath: '/docs/source.txt',
      path: '/logs/archive/copied.txt',
    });
    await expect(
      service.movePath('session-1', 'logs/archive/copied.txt', 'logs/archive/moved.txt'),
    ).resolves.toEqual({
      fromPath: '/logs/archive/copied.txt',
      path: '/logs/archive/moved.txt',
    });
    await expect(
      service.createSymlink('session-1', {
        linkPath: 'logs/archive/link.txt',
        targetPath: '/docs/source.txt',
      }),
    ).resolves.toEqual({
      path: '/logs/archive/link.txt',
      target: '/docs/source.txt',
    });
    await expect(service.readSymlink('session-1', 'logs/archive/link.txt')).resolves.toEqual({
      path: '/logs/archive/link.txt',
      target: '/docs/source.txt',
    });
    await expect(service.deletePath('session-1', 'logs/archive/moved.txt')).resolves.toEqual({
      deleted: true,
      path: '/logs/archive/moved.txt',
    });
    await expect(service.deletePath('session-1', 'logs/archive/moved.txt')).resolves.toEqual({
      deleted: false,
      path: '/logs/archive/moved.txt',
    });

    expect(
      fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'logs', 'archive', 'link.txt'), 'utf8'),
    ).toBe('source\n');
  });

  it('supports backend-owned glob and grep operations', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-host-filesystem-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-2');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\nneedle here\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'notes.txt'), 'alpha\nneedle again\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'binary.bin'), Buffer.from([0, 159, 146, 150]));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'chart.png'), Buffer.from([137, 80, 78, 71]));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), new Date('2026-04-20T00:00:00.000Z'), new Date('2026-04-20T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'notes.txt'), new Date('2026-04-21T00:00:00.000Z'), new Date('2026-04-21T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'binary.bin'), new Date('2026-04-22T00:00:00.000Z'), new Date('2026-04-22T00:00:00.000Z'));
    fs.utimesSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'nested', 'chart.png'), new Date('2026-04-23T00:00:00.000Z'), new Date('2026-04-23T00:00:00.000Z'));

    await expect(service.globPaths('session-2', {
      maxResults: 10,
      path: 'docs',
      pattern: '**/*.*',
    })).resolves.toEqual({
      basePath: '/docs',
      matches: ['/docs/nested/chart.png', '/docs/nested/binary.bin', '/docs/nested/notes.txt', '/docs/readme.md'],
      totalMatches: 4,
      truncated: false,
    });

    await expect(service.grepText('session-2', {
      include: '**/*.*',
      maxLineLength: 2000,
      maxMatches: 10,
      path: 'docs',
      pattern: 'needle',
    })).resolves.toEqual({
      matches: [
        {
          line: 2,
          text: 'needle again',
          virtualPath: '/docs/nested/notes.txt',
        },
        {
          line: 2,
          text: 'needle here',
          virtualPath: '/docs/readme.md',
        },
      ],
      partial: false,
      totalMatches: 2,
      truncated: false,
    });
  });

  it('supports backend-owned read range for file and directory targets', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-host-read-range-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-3');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.txt'),
      `first line\n${'x'.repeat(2010)}\nthird line\n`,
      'utf8',
    );
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'second.txt'), 'next\n', 'utf8');

    await expect(service.readPathRange('session-3', {
      limit: 1,
      maxLineLength: 2000,
      offset: 2,
      path: 'docs/readme.txt',
    })).resolves.toEqual({
      byteLimited: false,
      limit: 1,
      lines: [`${'x'.repeat(2000)}... (line truncated)`],
      mimeType: 'text/plain',
      offset: 2,
      path: '/docs/readme.txt',
      totalBytes: 2033,
      totalLines: 3,
      truncated: true,
      type: 'file',
    });

    await expect(service.readPathRange('session-3', {
      limit: 5,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs',
    })).resolves.toEqual({
      entries: ['readme.txt', 'second.txt'],
      limit: 5,
      offset: 1,
      path: '/docs',
      totalEntries: 2,
      truncated: false,
      type: 'directory',
    });
  });

  it('reports read asset kinds and byte-limited text windows', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-host-read-assets-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-4');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'chart.png'), Buffer.from([137, 80, 78, 71]));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'guide.pdf'), Buffer.from('%PDF-1.7'));
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'archive.bin'), Buffer.from([0, 159, 146, 150]));
    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'large.txt'),
      Array.from({ length: 400 }, (_, index) => `line-${index}-${'x'.repeat(180)}`).join('\n'),
      'utf8',
    );

    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/chart.png',
    })).resolves.toEqual({
      mimeType: 'image/png',
      path: '/docs/chart.png',
      size: 4,
      type: 'image',
    });
    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/guide.pdf',
    })).resolves.toEqual({
      mimeType: 'application/pdf',
      path: '/docs/guide.pdf',
      size: 8,
      type: 'pdf',
    });
    await expect(service.readPathRange('session-4', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/archive.bin',
    })).resolves.toEqual({
      mimeType: 'application/octet-stream',
      path: '/docs/archive.bin',
      size: 4,
      type: 'binary',
    });
    await expect(service.readPathRange('session-4', {
      limit: 400,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/large.txt',
    })).resolves.toEqual(expect.objectContaining({
      byteLimited: true,
      mimeType: 'text/plain',
      path: '/docs/large.txt',
      truncated: true,
      type: 'file',
    }));
  });

  it('returns nearby path suggestions when the target path is missing', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-host-read-suggest-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-5');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'readme.md'), '# title\n', 'utf8');
    fs.writeFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'reader-notes.md'), '# notes\n', 'utf8');

    await expect(service.readPathRange('session-5', {
      limit: 10,
      maxLineLength: 2000,
      offset: 1,
      path: 'docs/read',
    })).rejects.toThrow('/docs/readme.md');
  });

  it('returns write metadata and tolerant edit strategy details', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-runtime-host-write-edit-'),
    );
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeHostFilesystemBackendService(runtimeSessionEnvironmentService);
    const sessionEnvironment = await runtimeSessionEnvironmentService.getSessionEnvironment('session-6');

    fs.mkdirSync(path.join(sessionEnvironment.sessionRoot, 'docs'), { recursive: true });

    await expect(service.writeTextFile('session-6', 'docs/output.txt', 'first line\nsecond line\n')).resolves.toEqual({
      created: true,
      lineCount: 2,
      path: '/docs/output.txt',
      size: 23,
    });

    fs.writeFileSync(
      path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'),
      'if (true) {\n  console.log("alpha");\n}\n',
      'utf8',
    );

    await expect(service.editTextFile('session-6', {
      filePath: 'docs/block.ts',
      newString: 'if (true) {\n    console.log("beta");\n}\n',
      oldString: 'if (true) {\nconsole.log("alpha");\n}\n',
    })).resolves.toEqual({
      occurrences: 1,
      path: '/docs/block.ts',
      strategy: 'line-trimmed',
    });
    expect(fs.readFileSync(path.join(sessionEnvironment.sessionRoot, 'docs', 'block.ts'), 'utf8')).toBe(
      'if (true) {\n    console.log("beta");\n}\n',
    );
  });
});
