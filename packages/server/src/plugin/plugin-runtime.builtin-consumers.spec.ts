import type { ResponseAfterSendHookPayload } from '@garlic-claw/shared';
import { createAutomationRecorderPlugin } from './builtin/automation-recorder.plugin';
import { BuiltinPluginTransport } from './builtin/builtin-plugin.transport';
import { createMessageEntryRecorderPlugin } from './builtin/message-entry-recorder.plugin';
import { createMessageLifecycleRecorderPlugin } from './builtin/message-lifecycle-recorder.plugin';
import { createPluginGovernanceRecorderPlugin } from './builtin/plugin-governance-recorder.plugin';
import { createResponseRecorderPlugin } from './builtin/response-recorder.plugin';
import { createToolAuditPlugin } from './builtin/tool-audit.plugin';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService builtin consumers', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let hostService: PluginRuntimeSpecFixture['hostService'];
  let callContext: PluginRuntimeSpecFixture['callContext'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];

  beforeEach(() => {
    ({
      service,
      hostService,
      callContext,
      builtinManifest,
    } = createPluginRuntimeSpecFixture());
  });

  it('runs builtin automation:after-run consumers through the unified host api facade', async () => {
    const definition = createAutomationRecorderPlugin();
    const hookContext = {
      source: 'automation' as const,
      userId: 'user-1',
      automationId: 'automation-1',
    };
    const payload = {
      context: hookContext,
      automation: {
        id: 'automation-1',
        name: '咖啡提醒',
        trigger: {
          type: 'manual' as const,
        },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T12:00:00.000Z',
        updatedAt: '2026-03-28T12:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
        },
      ],
    };

    hostService.call
      .mockResolvedValueOnce({
        automationId: 'automation-1',
        automationName: '咖啡提醒',
        status: 'success',
        triggerType: 'manual',
        resultCount: 1,
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runHook({
        hookName: 'automation:after-run',
        context: hookContext,
        payload,
      }),
    ).resolves.toEqual(payload);

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.automation-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'automation.automation-1.last-run',
        value: {
          automationId: 'automation-1',
          automationName: '咖啡提醒',
          status: 'success',
          triggerType: 'manual',
          resultCount: 1,
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.automation-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'automation:observed',
        message: '自动化 咖啡提醒 执行完成：success',
        metadata: {
          automationId: 'automation-1',
          automationName: '咖啡提醒',
          status: 'success',
          triggerType: 'manual',
          resultCount: 1,
        },
      },
    });
  });

  it('runs builtin conversation/message lifecycle consumers through the unified host api facade', async () => {
    const definition = createMessageLifecycleRecorderPlugin();
    const conversationContext = {
      source: 'http-route' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const messageContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
    };

    hostService.call
      .mockResolvedValueOnce({
        conversationId: 'conversation-1',
        titleLength: 4,
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:created',
        conversationId: 'conversation-1',
        messageId: null,
        role: 'user',
        contentLength: 4,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:updated',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        role: 'assistant',
        contentLength: 6,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:deleted',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        role: 'assistant',
        contentLength: 6,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'conversation:created',
        context: conversationContext,
        payload: {
          context: conversationContext,
          conversation: {
            id: 'conversation-1',
            title: '新的对话',
            createdAt: '2026-03-28T12:00:00.000Z',
            updatedAt: '2026-03-28T12:00:00.000Z',
          },
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runHook({
        hookName: 'message:created',
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          message: {
            role: 'user',
            content: '原始输入',
            parts: [
              {
                type: 'text',
                text: '原始输入',
              },
            ],
            status: 'completed',
          },
          modelMessages: [
            {
              role: 'user',
              content: '原始输入',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: messageContext,
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '原始输入',
        parts: [
          {
            type: 'text',
            text: '原始输入',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: '原始输入',
        },
      ],
    });

    await expect(
      service.runHook({
        hookName: 'message:updated',
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          messageId: 'message-1',
          currentMessage: {
            id: 'message-1',
            role: 'assistant',
            content: '旧回复',
            parts: [
              {
                type: 'text',
                text: '旧回复',
              },
            ],
            status: 'completed',
          },
          nextMessage: {
            id: 'message-1',
            role: 'assistant',
            content: '更新后的回复',
            parts: [
              {
                type: 'text',
                text: '更新后的回复',
              },
            ],
            status: 'completed',
          },
        },
      } as never),
    ).resolves.toEqual({
      context: messageContext,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'assistant',
        content: '旧回复',
        parts: [
          {
            type: 'text',
            text: '旧回复',
          },
        ],
        status: 'completed',
      },
      nextMessage: {
        id: 'message-1',
        role: 'assistant',
        content: '更新后的回复',
        parts: [
          {
            type: 'text',
            text: '更新后的回复',
          },
        ],
        status: 'completed',
      },
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'message:deleted',
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          messageId: 'message-1',
          message: {
            id: 'message-1',
            role: 'assistant',
            content: '更新后的回复',
            parts: [
              {
                type: 'text',
                text: '更新后的回复',
              },
            ],
            status: 'completed',
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: conversationContext,
      method: 'storage.set',
      params: {
        key: 'conversation.conversation-1.last-created',
        value: {
          conversationId: 'conversation-1',
          titleLength: 4,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: conversationContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'conversation:observed',
        message: '会话 conversation-1 已创建',
        metadata: {
          conversationId: 'conversation-1',
          titleLength: 4,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'conversation.conversation-1.last-message-created',
        value: {
          eventType: 'message:created',
          conversationId: 'conversation-1',
          messageId: null,
          role: 'user',
          contentLength: 4,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '会话 conversation-1 已创建一条 user 消息',
        metadata: {
          eventType: 'message:created',
          conversationId: 'conversation-1',
          messageId: null,
          role: 'user',
          contentLength: 4,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'message.message-1.last-updated',
        value: {
          eventType: 'message:updated',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(6, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '消息 message-1 已更新',
        metadata: {
          eventType: 'message:updated',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(7, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'message.message-1.last-deleted',
        value: {
          eventType: 'message:deleted',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(8, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '消息 message-1 已删除',
        metadata: {
          eventType: 'message:deleted',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
  });

  it('runs builtin message entry consumers through the unified host api facade', async () => {
    const definition = createMessageEntryRecorderPlugin();
    const hookContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
    };

    hostService.call.mockResolvedValue(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    hostService.call.mockReset();
    hostService.call.mockResolvedValue(true);

    await expect(
      service.runHook({
        hookName: 'message:received',
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          message: {
            role: 'user',
            content: '/route 原始输入',
            parts: [
              {
                type: 'text',
                text: '/route 原始输入',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '/route 原始输入',
            },
          ],
        },
      }),
    ).resolves.toEqual({
      action: 'continue',
      payload: {
        context: hookContext,
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        message: {
          role: 'user',
          content: '/route 原始输入',
          parts: [
            {
              type: 'text',
              text: '/route 原始输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 原始输入',
          },
        ],
      },
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'chat:waiting-model',
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [
              {
                role: 'user',
                content: '/route 原始输入',
              },
            ],
            availableTools: [
              {
                name: 'save_memory',
                description: '保存记忆',
                parameters: builtinManifest.tools[0].parameters,
                pluginId: 'builtin.memory-tools',
                runtimeKind: 'builtin',
              },
            ],
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'message.received.last-entry',
        value: {
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          contentLength: 11,
          partsCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:received:observed',
        message: '会话 conversation-1 收到一条待处理用户消息',
        metadata: {
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          contentLength: 11,
          partsCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'message.waiting.last-model-request',
        value: {
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messageCount: 1,
          toolCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'chat:waiting-model:observed',
        message: '会话 conversation-1 即将进入模型调用',
        metadata: {
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messageCount: 1,
          toolCount: 1,
          userId: 'user-1',
        },
      },
    });
  });

  it('runs builtin tool:after-call consumers through the unified host api facade', async () => {
    const definition = createToolAuditPlugin();
    const payload = {
      context: callContext,
      source: {
        kind: 'plugin' as const,
        id: 'builtin.memory-tools',
        label: '记忆工具',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin' as const,
      },
      pluginId: 'builtin.memory-tools',
      runtimeKind: 'builtin' as const,
      tool: {
        ...builtinManifest.tools[0],
        toolId: 'plugin:builtin.memory-tools:save_memory',
        callName: 'save_memory',
      },
      params: {
        content: '记住我喜欢咖啡',
      },
      output: {
        saved: true,
      },
    };

    hostService.call
      .mockResolvedValueOnce({
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        toolId: 'plugin:builtin.memory-tools:save_memory',
        callName: 'save_memory',
        toolName: 'save_memory',
        callSource: 'chat-tool',
        paramKeys: ['content'],
        outputKind: 'object',
        userId: 'user-1',
        conversationId: 'conversation-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runHook({
        hookName: 'tool:after-call',
        context: callContext,
        payload,
      }),
    ).resolves.toEqual(payload);

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.tool-audit',
      context: callContext,
      method: 'storage.set',
      params: {
        key: 'tool.builtin.memory-tools.save_memory.last-call',
        value: {
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
          toolName: 'save_memory',
          callSource: 'chat-tool',
          paramKeys: ['content'],
          outputKind: 'object',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.tool-audit',
      context: callContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'tool:observed',
        message: '工具 builtin.memory-tools:save_memory 执行完成',
        metadata: {
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
          toolName: 'save_memory',
          callSource: 'chat-tool',
          paramKeys: ['content'],
          outputKind: 'object',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
  });

  it('runs builtin response:after-send consumers through the unified host api facade', async () => {
    const definition = createResponseRecorderPlugin();
    const hookContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const payload: ResponseAfterSendHookPayload = {
      context: hookContext,
      responseSource: 'model' as const,
      assistantMessageId: 'assistant-1',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantContent: 'Coffee saved.',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'save_memory',
          input: {
            content: '记住咖啡偏好',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'save_memory',
          output: {
            saved: true,
          },
        },
      ],
      assistantParts: [
        {
          type: 'text',
          text: '咖啡偏好已保存。',
        },
      ],
      sentAt: '2026-03-28T12:34:56.000Z',
    };

    hostService.call
      .mockResolvedValueOnce({
        assistantMessageId: 'assistant-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        responseSource: 'model',
        contentLength: 13,
        toolCallCount: 1,
        toolResultCount: 1,
        sentAt: '2026-03-28T12:34:56.000Z',
        userId: 'user-1',
        conversationId: 'conversation-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runBroadcastHook({
        hookName: 'response:after-send',
        context: hookContext,
        payload,
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.response-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'response.assistant-1.last-sent',
        value: {
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          responseSource: 'model',
          contentLength: 13,
          toolCallCount: 1,
          toolResultCount: 1,
          sentAt: '2026-03-28T12:34:56.000Z',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.response-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'response:sent',
        message: '回复 assistant-1 已发送 (model)',
        metadata: {
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          responseSource: 'model',
          contentLength: 13,
          toolCallCount: 1,
          toolResultCount: 1,
          sentAt: '2026-03-28T12:34:56.000Z',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
  });

  it('runs builtin plugin:* governance consumers through the unified host api facade', async () => {
    const definition = createPluginGovernanceRecorderPlugin();
    const hookContext = {
      source: 'plugin' as const,
    };

    hostService.call.mockResolvedValue(true);
    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    hostService.call.mockReset();
    hostService.call
      .mockResolvedValueOnce({
        eventType: 'plugin:loaded',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        errorType: null,
        errorMessage: null,
        occurredAt: '2026-03-28T12:00:00.000Z',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'plugin:unloaded',
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
        deviceType: 'pc',
        errorType: null,
        errorMessage: null,
        occurredAt: '2026-03-28T12:05:00.000Z',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'plugin:error',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        errorType: 'tool:error',
        errorMessage: 'tool exploded',
        occurredAt: '2026-03-28T12:10:00.000Z',
      })
      .mockResolvedValueOnce(true);

    await expect(
      service.runBroadcastHook({
        hookName: 'plugin:loaded',
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'builtin.memory-tools',
            runtimeKind: 'builtin',
            deviceType: 'builtin',
            manifest: builtinManifest,
          },
          loadedAt: '2026-03-28T12:00:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runBroadcastHook({
        hookName: 'plugin:unloaded',
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'remote.pc-host',
            runtimeKind: 'remote',
            deviceType: 'pc',
            manifest: null,
          },
          unloadedAt: '2026-03-28T12:05:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runBroadcastHook({
        hookName: 'plugin:error',
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'builtin.memory-tools',
            runtimeKind: 'builtin',
            deviceType: 'builtin',
            manifest: builtinManifest,
          },
          error: {
            type: 'tool:error',
            message: 'tool exploded',
            metadata: {
              toolName: 'save_memory',
            },
          },
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.builtin.memory-tools.last-governance-event',
        value: {
          eventType: 'plugin:loaded',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:00:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'plugin:observed',
        message: '插件 builtin.memory-tools 已加载',
        metadata: {
          eventType: 'plugin:loaded',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:00:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.remote.pc-host.last-governance-event',
        value: {
          eventType: 'plugin:unloaded',
          pluginId: 'remote.pc-host',
          runtimeKind: 'remote',
          deviceType: 'pc',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:05:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'plugin:observed',
        message: '插件 remote.pc-host 已卸载',
        metadata: {
          eventType: 'plugin:unloaded',
          pluginId: 'remote.pc-host',
          runtimeKind: 'remote',
          deviceType: 'pc',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:05:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.builtin.memory-tools.last-governance-event',
        value: {
          eventType: 'plugin:error',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: 'tool:error',
          errorMessage: 'tool exploded',
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(6, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'warn',
        type: 'plugin:observed',
        message: '插件 builtin.memory-tools 发生失败：tool:error',
        metadata: {
          eventType: 'plugin:error',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: 'tool:error',
          errorMessage: 'tool exploded',
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      },
    });
  });
});
