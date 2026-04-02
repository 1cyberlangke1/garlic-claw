import {
  createConversationSessionMessageReceivedPayload,
  createConversationSessionRecord,
  extendConversationSession,
  finishConversationSessionForRuntime,
  finishOwnedConversationSession,
  getActiveConversationSession,
  getActiveConversationSessionInfo,
  getConversationSessionInfoForRuntime,
  getDispatchableConversationSessionRecord,
  prepareDispatchableConversationSessionMessageReceivedHook,
  getOwnedConversationSession,
  keepConversationSessionForRuntime,
  listActiveConversationSessionInfos,
  recordConversationSessionMessage,
  startConversationSessionForRuntime,
  syncConversationSessionMessageReceivedPayload,
  toConversationSessionInfo,
} from './plugin-runtime-session.helpers';
import type { PluginManifest } from '@garlic-claw/shared';

function createManifest(input: {
  id: string;
  hookName?: 'message:received' | 'chat:after-model';
}): PluginManifest {
  return {
    id: input.id,
    name: input.id,
    version: '1.0.0',
    runtime: 'builtin',
    permissions: [],
    tools: [],
    hooks: input.hookName
      ? [
          {
            name: input.hookName,
          },
        ]
      : [],
  };
}

describe('plugin-runtime-session.helpers', () => {
  it('creates a session record and converts it to public info', () => {
    const session = createConversationSessionRecord({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 30_000,
      captureHistory: true,
      metadata: {
        topic: 'demo',
      },
      now: Date.parse('2026-04-01T12:00:00.000Z'),
    });

    expect(session).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      startedAt: Date.parse('2026-04-01T12:00:00.000Z'),
      expiresAt: Date.parse('2026-04-01T12:00:30.000Z'),
      lastMatchedAt: null,
      captureHistory: true,
      historyMessages: [],
      metadata: {
        topic: 'demo',
      },
    });

    expect(
      toConversationSessionInfo(
        session,
        Date.parse('2026-04-01T12:00:10.000Z'),
      ),
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 20_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: null,
      captureHistory: true,
      historyMessages: [],
      metadata: {
        topic: 'demo',
      },
    });
  });

  it('returns active sessions, removes expired ones, and enforces ownership', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>([
      [
        'conversation-1',
        createConversationSessionRecord({
          pluginId: 'plugin-a',
          conversationId: 'conversation-1',
          timeoutMs: 30_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
      [
        'conversation-2',
        createConversationSessionRecord({
          pluginId: 'plugin-b',
          conversationId: 'conversation-2',
          timeoutMs: 1_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
    ]);

    expect(
      getActiveConversationSession(
        sessions,
        'conversation-1',
        Date.parse('2026-04-01T12:00:10.000Z'),
      ),
    )?.toMatchObject({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
    });

    expect(
      getActiveConversationSession(
        sessions,
        'conversation-2',
        Date.parse('2026-04-01T12:00:10.000Z'),
      ),
    ).toBeNull();
    expect(sessions.has('conversation-2')).toBe(false);

    expect(
      getOwnedConversationSession(
        sessions,
        'plugin-a',
        'conversation-1',
        Date.parse('2026-04-01T12:00:10.000Z'),
      ),
    )?.toMatchObject({
      pluginId: 'plugin-a',
    });
    expect(
      getOwnedConversationSession(
        sessions,
        'plugin-b',
        'conversation-1',
        Date.parse('2026-04-01T12:00:10.000Z'),
      ),
    ).toBeNull();
  });

  it('extends, records, and finishes owned sessions', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>();
    const session = createConversationSessionRecord({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 30_000,
      captureHistory: true,
      now: Date.parse('2026-04-01T12:00:00.000Z'),
    });
    sessions.set('conversation-1', session);

    extendConversationSession(session, {
      timeoutMs: 15_000,
      resetTimeout: false,
      now: Date.parse('2026-04-01T12:00:05.000Z'),
    });
    expect(session.expiresAt).toBe(Date.parse('2026-04-01T12:00:45.000Z'));

    const info = recordConversationSessionMessage(
      session,
      {
        role: 'user',
        content: 'hello',
        parts: [],
      },
      Date.parse('2026-04-01T12:00:10.000Z'),
    );
    expect(info.lastMatchedAt).toBe('2026-04-01T12:00:10.000Z');
    expect(info.historyMessages).toEqual([
      {
        role: 'user',
        content: 'hello',
        parts: [],
      },
    ]);

    expect(
      finishOwnedConversationSession(
        sessions,
        'plugin-a',
        'conversation-1',
        Date.parse('2026-04-01T12:00:15.000Z'),
      ),
    ).toBe(true);
    expect(sessions.size).toBe(0);
    expect(finishOwnedConversationSession(sessions, 'plugin-a', 'conversation-1')).toBe(false);
  });

  it('creates and syncs message:received payloads for active sessions', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>();
    const session = createConversationSessionRecord({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 30_000,
      captureHistory: true,
      now: Date.parse('2026-04-01T12:00:00.000Z'),
    });
    sessions.set('conversation-1', session);

    const payload = createConversationSessionMessageReceivedPayload({
      session,
      payload: {
        context: {
          source: 'chat-hook',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        message: {
          role: 'user',
          content: 'hello',
          parts: [],
        },
        modelMessages: [
          {
            role: 'user',
            content: 'hello',
          },
        ],
      },
      now: Date.parse('2026-04-01T12:00:05.000Z'),
    });

    expect(payload.session).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 25_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: '2026-04-01T12:00:05.000Z',
      captureHistory: true,
      historyMessages: [
        {
          role: 'user',
          content: 'hello',
          parts: [],
        },
      ],
    });

    expect(
      syncConversationSessionMessageReceivedPayload({
        sessions,
        session,
        payload,
        now: Date.parse('2026-04-01T12:00:06.000Z'),
      }).session,
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 24_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: '2026-04-01T12:00:05.000Z',
      captureHistory: true,
      historyMessages: [
        {
          role: 'user',
          content: 'hello',
          parts: [],
        },
      ],
    });
  });

  it('starts, reads, keeps, and finishes runtime sessions from context', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>();
    const context = {
      source: 'plugin' as const,
      conversationId: 'conversation-1',
    };

    expect(
      startConversationSessionForRuntime({
        sessions,
        pluginId: 'plugin-a',
        context,
        method: 'conversation.session.start',
        timeoutMs: 30_000,
        captureHistory: false,
        now: Date.parse('2026-04-01T12:00:00.000Z'),
      }),
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 30_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: null,
      captureHistory: false,
      historyMessages: [],
    });

    expect(
      getConversationSessionInfoForRuntime({
        sessions,
        pluginId: 'plugin-a',
        context,
        method: 'conversation.session.get',
        now: Date.parse('2026-04-01T12:00:10.000Z'),
      }),
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 20_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: null,
      captureHistory: false,
      historyMessages: [],
    });

    expect(
      keepConversationSessionForRuntime({
        sessions,
        pluginId: 'plugin-a',
        context,
        method: 'conversation.session.keep',
        timeoutMs: 5_000,
        resetTimeout: false,
        now: Date.parse('2026-04-01T12:00:10.000Z'),
      }),
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 25_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:35.000Z',
      lastMatchedAt: null,
      captureHistory: false,
      historyMessages: [],
    });

    expect(
      finishConversationSessionForRuntime({
        sessions,
        pluginId: 'plugin-a',
        context,
        method: 'conversation.session.finish',
        now: Date.parse('2026-04-01T12:00:11.000Z'),
      }),
    ).toBe(true);
    expect(
      getConversationSessionInfoForRuntime({
        sessions,
        pluginId: 'plugin-a',
        context,
        method: 'conversation.session.get',
        now: Date.parse('2026-04-01T12:00:11.000Z'),
      }),
    ).toBeNull();
  });

  it('reads active session info and lists active sessions with optional plugin filtering', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>([
      [
        'conversation-1',
        createConversationSessionRecord({
          pluginId: 'plugin-a',
          conversationId: 'conversation-1',
          timeoutMs: 30_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
      [
        'conversation-2',
        createConversationSessionRecord({
          pluginId: 'plugin-b',
          conversationId: 'conversation-2',
          timeoutMs: 10_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
    ]);

    expect(
      getActiveConversationSessionInfo(
        sessions,
        'conversation-1',
        Date.parse('2026-04-01T12:00:05.000Z'),
      ),
    ).toEqual({
      pluginId: 'plugin-a',
      conversationId: 'conversation-1',
      timeoutMs: 25_000,
      startedAt: '2026-04-01T12:00:00.000Z',
      expiresAt: '2026-04-01T12:00:30.000Z',
      lastMatchedAt: null,
      captureHistory: false,
      historyMessages: [],
    });

    expect(
      listActiveConversationSessionInfos(
        sessions,
        undefined,
        Date.parse('2026-04-01T12:00:05.000Z'),
      ).map((session) => session.conversationId),
    ).toEqual([
      'conversation-2',
      'conversation-1',
    ]);

    expect(
      listActiveConversationSessionInfos(
        sessions,
        'plugin-a',
        Date.parse('2026-04-01T12:00:05.000Z'),
      ),
    ).toEqual([
      {
        pluginId: 'plugin-a',
        conversationId: 'conversation-1',
        timeoutMs: 25_000,
        startedAt: '2026-04-01T12:00:00.000Z',
        expiresAt: '2026-04-01T12:00:30.000Z',
        lastMatchedAt: null,
        captureHistory: false,
        historyMessages: [],
      },
    ]);
  });

  it('returns dispatchable session owner records and removes invalid ones', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>([
      [
        'conversation-1',
        createConversationSessionRecord({
          pluginId: 'plugin-a',
          conversationId: 'conversation-1',
          timeoutMs: 30_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
      [
        'conversation-2',
        createConversationSessionRecord({
          pluginId: 'plugin-b',
          conversationId: 'conversation-2',
          timeoutMs: 30_000,
          captureHistory: false,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
    ]);
    const records = new Map([
      [
        'plugin-a',
        {
          manifest: createManifest({
            id: 'plugin-a',
            hookName: 'message:received',
          }),
          governance: {
            scope: {
              defaultEnabled: true,
              conversations: {},
            },
          },
        },
      ],
      [
        'plugin-b',
        {
          manifest: createManifest({
            id: 'plugin-b',
          }),
          governance: {
            scope: {
              defaultEnabled: true,
              conversations: {},
            },
          },
        },
      ],
    ]);

    expect(
      getDispatchableConversationSessionRecord({
        sessions,
        records,
        conversationId: 'conversation-1',
        context: {
          source: 'chat-hook',
          conversationId: 'conversation-1',
        },
        hookName: 'message:received',
        now: Date.parse('2026-04-01T12:00:05.000Z'),
      }),
    )?.toMatchObject({
      session: {
        pluginId: 'plugin-a',
      },
      record: {
        manifest: {
          id: 'plugin-a',
        },
      },
    });

    expect(
      getDispatchableConversationSessionRecord({
        sessions,
        records,
        conversationId: 'conversation-2',
        context: {
          source: 'chat-hook',
          conversationId: 'conversation-2',
        },
        hookName: 'message:received',
        now: Date.parse('2026-04-01T12:00:05.000Z'),
      }),
    ).toBeNull();
    expect(sessions.has('conversation-2')).toBe(false);
  });

  it('prepares dispatchable message:received session hooks with cloned payload', () => {
    const sessions = new Map<string, ReturnType<typeof createConversationSessionRecord>>([
      [
        'conversation-1',
        createConversationSessionRecord({
          pluginId: 'plugin-a',
          conversationId: 'conversation-1',
          timeoutMs: 30_000,
          captureHistory: true,
          now: Date.parse('2026-04-01T12:00:00.000Z'),
        }),
      ],
    ]);
    const records = new Map([
      [
        'plugin-a',
        {
          manifest: createManifest({
            id: 'plugin-a',
            hookName: 'message:received',
          }),
          governance: {
            scope: {
              defaultEnabled: true,
              conversations: {},
            },
          },
        },
      ],
    ]);

    expect(
      prepareDispatchableConversationSessionMessageReceivedHook({
        sessions,
        records,
        context: {
          source: 'chat-hook',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'chat-hook',
            conversationId: 'conversation-1',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          message: {
            role: 'user',
            content: 'hello',
            parts: [],
          },
          modelMessages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
        },
        now: Date.parse('2026-04-01T12:00:05.000Z'),
      }),
    )?.toEqual({
      session: expect.objectContaining({
        pluginId: 'plugin-a',
        conversationId: 'conversation-1',
      }),
      record: expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'plugin-a',
        }),
      }),
      payload: expect.objectContaining({
        conversationId: 'conversation-1',
        session: expect.objectContaining({
          pluginId: 'plugin-a',
          conversationId: 'conversation-1',
          lastMatchedAt: '2026-04-01T12:00:05.000Z',
        }),
      }),
    });
  });
});
