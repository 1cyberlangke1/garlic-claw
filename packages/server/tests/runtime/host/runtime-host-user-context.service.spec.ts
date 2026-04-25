import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';

describe('RuntimeHostUserContextService', () => {
  const originalMemoriesPath = process.env.GARLIC_CLAW_MEMORIES_PATH;
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(
      os.tmpdir(),
      `gc-memories-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_MEMORIES_PATH = storagePath;
  });

  afterEach(() => {
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
    if (originalMemoriesPath) {
      process.env.GARLIC_CLAW_MEMORIES_PATH = originalMemoriesPath;
      return;
    }
    delete process.env.GARLIC_CLAW_MEMORIES_PATH;
  });

  it('persists memories to disk and restores them after service recreation', () => {
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
});
