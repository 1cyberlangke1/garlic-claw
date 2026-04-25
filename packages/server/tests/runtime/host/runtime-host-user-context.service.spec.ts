import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';

describe('RuntimeHostUserContextService', () => {
  const originalMemoriesPath = process.env.GARLIC_CLAW_MEMORIES_PATH;
  const originalJestWorkerId = process.env.JEST_WORKER_ID;
  const originalCwd = process.cwd();
  let runtimeRoot: string;
  let storagePath: string;

  beforeEach(() => {
    runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-memory-runtime-'));
    storagePath = path.join(
      os.tmpdir(),
      `gc-memories-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.chdir(runtimeRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
    if (fs.existsSync(runtimeRoot)) {
      fs.rmSync(runtimeRoot, { force: true, recursive: true });
    }
    if (originalMemoriesPath) {
      process.env.GARLIC_CLAW_MEMORIES_PATH = originalMemoriesPath;
    } else {
      delete process.env.GARLIC_CLAW_MEMORIES_PATH;
    }
    if (originalJestWorkerId) {
      process.env.JEST_WORKER_ID = originalJestWorkerId;
      return;
    }
    delete process.env.JEST_WORKER_ID;
  });

  it('persists memories to the explicit path and restores them after service recreation', () => {
    process.env.GARLIC_CLAW_MEMORIES_PATH = storagePath;
    process.env.JEST_WORKER_ID = '1';

    const service = new RuntimeHostUserContextService();

    service.saveMemory(
      {
        source: 'plugin',
        userId: 'user-1',
      },
      {
        category: 'preference',
        content: '用户喜欢手冲咖啡',
        keywords: ['咖啡', '手冲'],
      },
    );

    expect(fs.existsSync(storagePath)).toBe(true);

    const reloaded = new RuntimeHostUserContextService();
    expect(reloaded.searchMemoriesByUser('user-1', '咖啡', 10)).toEqual([
      expect.objectContaining({
        category: 'preference',
        content: '用户喜欢手冲咖啡',
        keywords: ['咖啡', '手冲'],
        userId: 'user-1',
      }),
    ]);
  });

  it('does not persist to the default tmp path during jest when no explicit path is configured', () => {
    delete process.env.GARLIC_CLAW_MEMORIES_PATH;
    process.env.JEST_WORKER_ID = '1';
    const defaultStoragePath = path.join(runtimeRoot, 'tmp', 'memories.server.json');

    const service = new RuntimeHostUserContextService();
    service.saveMemory(
      {
        source: 'plugin',
        userId: 'user-1',
      },
      {
        category: 'preference',
        content: '用户喜欢手冲咖啡',
      },
    );

    expect(fs.existsSync(defaultStoragePath)).toBe(false);
  });

  it('still persists to the explicit path when jest worker id is present', () => {
    process.env.GARLIC_CLAW_MEMORIES_PATH = storagePath;
    process.env.JEST_WORKER_ID = '1';

    const service = new RuntimeHostUserContextService();
    service.saveMemory(
      {
        source: 'plugin',
        userId: 'user-1',
      },
      {
        category: 'preference',
        content: '用户喜欢手冲咖啡',
      },
    );

    expect(fs.existsSync(storagePath)).toBe(true);
  });
});
