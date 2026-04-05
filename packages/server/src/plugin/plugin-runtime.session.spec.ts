import type { PluginManifest } from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService conversation session', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];
  let createTransport: PluginRuntimeSpecFixture['createTransport'];

  beforeEach(() => {
    ({
      service,
      builtinManifest,
      createTransport,
    } = createPluginRuntimeSpecFixture());
  });

  it('starts, keeps, reads, and finishes conversation sessions through host calls', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      const manifest: PluginManifest = {
        ...builtinManifest,
        id: 'builtin.idiom-session',
        permissions: ['conversation:write'],
        tools: [],
        hooks: [
          {
            name: 'message:received',
          },
        ],
      };

      await service.registerPlugin({
        manifest,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.start' as never,
          params: {
            timeoutMs: 60000,
            captureHistory: true,
            metadata: {
              flow: 'idiom',
            },
          },
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      jest.advanceTimersByTime(10000);

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.keep' as never,
          params: {
            timeoutMs: 30000,
            resetTimeout: false,
          },
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 80000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.get' as never,
          params: {},
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 80000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.finish' as never,
          params: {},
        }),
      ).resolves.toBe(true);

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.get' as never,
          params: {},
        }),
      ).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('routes message:received through the active conversation session before later hooks', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      const sessionHook = jest.fn().mockResolvedValue({
        action: 'mutate',
        content: '会话插件接管后的输入',
        parts: [
          {
            type: 'text',
            text: '会话插件接管后的输入',
          },
        ],
        modelMessages: [
          {
            role: 'user',
            content: '会话插件接管后的输入',
          },
        ],
      });
      const skippedHook = jest.fn();

      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport({
          invokeHook: sessionHook,
        }),
      });
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.message-observer',
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport({
          invokeHook: skippedHook,
        }),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
          captureHistory: true,
        },
      });

      await expect(
        service.runHook({
          hookName: 'message:received',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          payload: {
            context: {
              source: 'chat-hook',
              userId: 'user-1',
              conversationId: 'conversation-1',
              activeProviderId: 'openai',
              activeModelId: 'gpt-5.2',
            },
            conversationId: 'conversation-1',
            providerId: 'openai',
            modelId: 'gpt-5.2',
            message: {
              role: 'user',
              content: '一马当先',
              parts: [
                {
                  type: 'text',
                  text: '一马当先',
                },
              ],
            },
            modelMessages: [
              {
                role: 'user',
                content: '一马当先',
              },
            ],
          },
        }),
      ).resolves.toEqual({
        action: 'continue',
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          session: {
            pluginId: 'builtin.idiom-session',
            conversationId: 'conversation-1',
            timeoutMs: 60000,
            startedAt: '2026-03-28T12:00:00.000Z',
            expiresAt: '2026-03-28T12:01:00.000Z',
            lastMatchedAt: '2026-03-28T12:00:00.000Z',
            captureHistory: true,
            historyMessages: [
              {
                role: 'user',
                content: '一马当先',
                parts: [
                  {
                    type: 'text',
                    text: '一马当先',
                  },
                ],
              },
            ],
          },
          message: {
            role: 'user',
            content: '会话插件接管后的输入',
            parts: [
              {
                type: 'text',
                text: '会话插件接管后的输入',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '会话插件接管后的输入',
            },
          ],
        },
      });

      expect(sessionHook).toHaveBeenCalledWith({
        hookName: 'message:received',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          session: {
            pluginId: 'builtin.idiom-session',
            conversationId: 'conversation-1',
            timeoutMs: 60000,
            startedAt: '2026-03-28T12:00:00.000Z',
            expiresAt: '2026-03-28T12:01:00.000Z',
            lastMatchedAt: '2026-03-28T12:00:00.000Z',
            captureHistory: true,
            historyMessages: [
              {
                role: 'user',
                content: '一马当先',
                parts: [
                  {
                    type: 'text',
                    text: '一马当先',
                  },
                ],
              },
            ],
          },
          message: {
            role: 'user',
            content: '一马当先',
            parts: [
              {
                type: 'text',
                text: '一马当先',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '一马当先',
            },
          ],
        },
      });
      expect(skippedHook).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists active conversation sessions for governance and can force-finish them by plugin ownership', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.second-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
          captureHistory: true,
          metadata: {
            flow: 'idiom',
          },
        },
      });
      await service.callHost({
        pluginId: 'builtin.second-session',
        context: {
          source: 'chat-hook',
          userId: 'user-2',
          conversationId: 'conversation-2',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 120000,
          captureHistory: false,
        },
      });

      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([
        {
          pluginId: 'builtin.idiom-session',
          conversationId: 'conversation-1',
          timeoutMs: 60000,
          startedAt: '2026-03-28T12:00:00.000Z',
          expiresAt: '2026-03-28T12:01:00.000Z',
          lastMatchedAt: null,
          captureHistory: true,
          historyMessages: [],
          metadata: {
            flow: 'idiom',
          },
        },
      ]);
      expect((service as any).listConversationSessions()).toEqual([
        expect.objectContaining({
          pluginId: 'builtin.idiom-session',
          conversationId: 'conversation-1',
        }),
        expect.objectContaining({
          pluginId: 'builtin.second-session',
          conversationId: 'conversation-2',
        }),
      ]);

      expect(
        (service as any).finishConversationSessionForGovernance(
          'builtin.idiom-session',
          'conversation-1',
        ),
      ).toBe(true);
      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([]);
      expect(
        (service as any).finishConversationSessionForGovernance(
          'builtin.idiom-session',
          'conversation-2',
        ),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops active conversation sessions immediately after governance refresh disables the plugin', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
        },
      });

      expect((service as any).listConversationSessions('builtin.idiom-session')).toHaveLength(1);

      service.refreshPluginGovernance('builtin.idiom-session', {
        configSchema: null,
        resolvedConfig: {},
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': false,
          },
        },
      });

      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops active conversation sessions when unregistering the owning plugin', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
        },
      });

      expect((service as any).listConversationSessions('builtin.idiom-session')).toHaveLength(1);

      service.unregisterPlugin('builtin.idiom-session');

      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
