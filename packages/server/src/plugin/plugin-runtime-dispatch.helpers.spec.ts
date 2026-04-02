import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  MessageReceivedHookPayload,
  PluginCallContext,
  PluginManifest,
} from '@garlic-claw/shared';
import {
  assertRuntimeRecordEnabled,
  getRuntimeRecordOrThrow,
  isRuntimeRecordEnabledForContext,
  invokeDispatchableHooks,
  listDispatchableHookRecords,
} from './plugin-runtime-dispatch.helpers';

function createManifest(input: {
  id: string;
  priority?: number;
  hookName?: 'message:received' | 'chat:after-model';
  commands?: string[];
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
            ...(typeof input.priority === 'number'
              ? { priority: input.priority }
              : {}),
            ...(input.commands
              ? {
                  filter: {
                    message: {
                      commands: input.commands,
                    },
                  },
                }
              : {}),
          },
        ]
      : [],
  };
}

function createRecord(input: {
  id: string;
  priority?: number;
  hookName?: 'message:received' | 'chat:after-model';
  commands?: string[];
  defaultEnabled?: boolean;
  conversations?: Record<string, boolean>;
}) {
  return {
    manifest: createManifest({
      id: input.id,
      priority: input.priority,
      hookName: input.hookName,
      commands: input.commands,
    }),
    governance: {
      scope: {
        defaultEnabled: input.defaultEnabled ?? true,
        conversations: input.conversations ?? {},
      },
    },
  };
}

describe('plugin-runtime-dispatch.helpers', () => {
  const context: PluginCallContext = {
    source: 'chat-hook',
    conversationId: 'conv-1',
  };

  const messagePayload: MessageReceivedHookPayload = {
    context,
    conversationId: 'conv-1',
    providerId: 'openai',
    modelId: 'gpt-5.2',
    message: {
      role: 'user',
      content: '/todo write tests',
      parts: [],
    },
    modelMessages: [
      {
        role: 'user',
        content: '/todo write tests',
      },
    ],
  };

  it('gets runtime records from map and throws on missing plugin', () => {
    const record = createRecord({
      id: 'plugin.alpha',
    });
    const records = new Map([[record.manifest.id, record]]);

    expect(getRuntimeRecordOrThrow(records, 'plugin.alpha')).toBe(record);
    expect(() => getRuntimeRecordOrThrow(records, 'plugin.missing')).toThrow(
      new NotFoundException('Plugin not found: plugin.missing'),
    );
  });

  it('checks and asserts runtime scope enablement', () => {
    const enabled = createRecord({
      id: 'plugin.enabled',
      defaultEnabled: true,
    });
    const disabled = createRecord({
      id: 'plugin.disabled',
      defaultEnabled: false,
    });

    expect(isRuntimeRecordEnabledForContext(enabled, context)).toBe(true);
    expect(isRuntimeRecordEnabledForContext(disabled, context)).toBe(false);
    expect(() => assertRuntimeRecordEnabled(enabled, context)).not.toThrow();
    expect(() => assertRuntimeRecordEnabled(disabled, context)).toThrow(
      new ForbiddenException('插件 plugin.disabled 在当前作用域已禁用'),
    );
  });

  it('lists dispatchable hook records by priority and plugin id', () => {
    const records = [
      createRecord({
        id: 'plugin.zeta',
        hookName: 'message:received',
        priority: 10,
      }),
      createRecord({
        id: 'plugin.beta',
        hookName: 'message:received',
        priority: 0,
      }),
      createRecord({
        id: 'plugin.alpha',
        hookName: 'message:received',
        priority: 0,
      }),
      createRecord({
        id: 'plugin.command-miss',
        hookName: 'message:received',
        priority: -1,
        commands: ['/ping'],
      }),
      createRecord({
        id: 'plugin.disabled',
        hookName: 'message:received',
        priority: -2,
        defaultEnabled: false,
      }),
      createRecord({
        id: 'plugin.other-hook',
        hookName: 'chat:after-model',
      }),
    ];

    expect(
      listDispatchableHookRecords({
        records,
        hookName: 'message:received',
        context,
        payload: messagePayload,
      }).map((record) => record.manifest.id),
    ).toEqual([
      'plugin.alpha',
      'plugin.beta',
      'plugin.zeta',
    ]);
  });

  it('invokes dispatchable hooks in sorted order and skips failed hooks', async () => {
    const invoked: string[] = [];
    const records = [
      createRecord({
        id: 'plugin.zeta',
        hookName: 'message:received',
        priority: 10,
      }),
      createRecord({
        id: 'plugin.alpha',
        hookName: 'message:received',
        priority: 0,
      }),
      createRecord({
        id: 'plugin.beta',
        hookName: 'message:received',
        priority: 0,
      }),
    ];

    const results = await invokeDispatchableHooks({
      records,
      hookName: 'message:received',
      context,
      payload: messagePayload,
      invoke: async (record, payload) => {
        invoked.push(record.manifest.id);
        if (record.manifest.id === 'plugin.beta') {
          throw new Error('boom');
        }

        const hookPayload = payload as unknown as MessageReceivedHookPayload;
        return {
          pluginId: record.manifest.id,
          conversationId: hookPayload.conversationId,
        };
      },
    });

    expect(invoked).toEqual([
      'plugin.alpha',
      'plugin.beta',
      'plugin.zeta',
    ]);
    expect(results).toEqual([
      {
        pluginId: 'plugin.alpha',
        conversationId: 'conv-1',
      },
      {
        pluginId: 'plugin.zeta',
        conversationId: 'conv-1',
      },
    ]);
  });
});
