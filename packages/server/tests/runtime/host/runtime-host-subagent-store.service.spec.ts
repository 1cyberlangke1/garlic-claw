import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeHostSubagentStoreService } from '../../../src/runtime/host/runtime-host-subagent-store.service';

describe('RuntimeHostSubagentStoreService', () => {
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `gc-subagent-store-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_SUBAGENTS_PATH = storagePath;
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SUBAGENTS_PATH;
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  });

  it('hides removed sessions from overview and detail while preserving internal records', () => {
    const store = new RuntimeHostSubagentStoreService();
    const created = store.createSubagent({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      pluginDisplayName: '子代理委派',
      pluginId: 'builtin.subagent-delegate',
      request: {
        messages: [{ content: 'summarize', role: 'user' }],
      },
      requestPreview: 'summarize',
      sessionId: 'subagent-session-1',
      sessionMessageCount: 1,
      sessionUpdatedAt: '2026-04-25T00:00:00.000Z',
      visibility: 'background',
      writeBackTarget: null,
    });

    expect(store.listOverview().subagents).toHaveLength(1);
    expect(store.removeSession('subagent-session-1', 'builtin.subagent-delegate')).toBe(true);
    expect(store.listOverview().subagents).toEqual([]);
    expect(store.listSubagents('builtin.subagent-delegate')).toEqual([]);
    expect(store.listPendingSubagents('builtin.subagent-delegate')).toEqual([]);
    expect(() => store.getSubagentOrThrow('subagent-session-1')).toThrow(
      'Subagent session not found: subagent-session-1',
    );

    store.updateSubagent('builtin.subagent-delegate', created.id, (subagent, now) => {
      subagent.finishedAt = now;
      subagent.status = 'completed';
    });

    expect(store.readSubagent(created.id)).toMatchObject({
      removedAt: expect.any(String),
      status: 'completed',
    });
  });
});
