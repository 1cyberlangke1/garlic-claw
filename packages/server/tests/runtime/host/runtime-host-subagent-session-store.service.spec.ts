import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeHostSubagentSessionStoreService } from '../../../src/runtime/host/runtime-host-subagent-session-store.service';

describe('RuntimeHostSubagentSessionStoreService', () => {
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `gc-subagent-session-store-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH = storagePath;
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SUBAGENT_SESSIONS_PATH;
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  });

  it('excludes removed sessions from capacity counting while preserving stored execution context', () => {
    const store = new RuntimeHostSubagentSessionStoreService();
    const session = store.createSession({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      messages: [{ content: 'first task', role: 'user' }],
      pluginId: 'builtin.memory',
    });

    expect(store.countConversationSessions('conversation-1')).toBe(1);
    expect(store.removeSession('builtin.memory', session.id)).toBe(true);
    expect(store.countConversationSessions('conversation-1')).toBe(0);
    expect(() => store.getSession('builtin.memory', session.id)).toThrow(
      `Subagent session not found: ${session.id}`,
    );

    const appended = store.appendAssistantMessage('builtin.memory', session.id, {
      message: {
        content: 'done',
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'done',
      toolCalls: [],
      toolResults: [],
    });

    expect(appended.removedAt).toEqual(expect.any(String));
    expect(appended.messages).toEqual([
      { content: 'first task', role: 'user' },
      { content: 'done', role: 'assistant' },
    ]);
    expect(store.readStoredSession('builtin.memory', session.id).messages).toHaveLength(2);
  });
});
