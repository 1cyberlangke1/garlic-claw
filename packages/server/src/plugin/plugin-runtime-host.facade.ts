import { PLUGIN_HOST_METHOD_PERMISSION_MAP } from '@garlic-claw/shared';
import type {
  ConversationSessionRecord,
  HostCallPayload,
  PluginCallContext,
  PluginHostMethod,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { ChatMessageService } from '../chat/chat-message.service';
import { getRuntimeRecordOrThrow } from './plugin-runtime-dispatch.helpers';
import {
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
} from './plugin-runtime-manifest.helpers';
import {
  readOptionalRuntimeBoolean,
  readOptionalRuntimeChatMessageParts,
  readOptionalRuntimeJsonValue,
  readOptionalRuntimeMessageTarget,
  readOptionalRuntimeString,
  readRuntimeSubagentRequest,
  readRuntimeSubagentTaskStartParams,
  requirePositiveRuntimeNumber,
  requireRuntimeString,
} from './plugin-runtime-input.helpers';
import { resolveCachedRuntimeServiceAsync } from './plugin-runtime-module.helpers';
import type { PluginRuntimeRecord } from './plugin-runtime.types';
import {
  finishConversationSessionForRuntime,
  getConversationSessionInfoForRuntime,
  keepConversationSessionForRuntime,
  startConversationSessionForRuntime,
} from './plugin-runtime-session.helpers';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';
import { PluginHostService } from './plugin-host.service';
import { PluginService } from './plugin.service';

type RuntimeHostCallInput = {
  records: Map<string, PluginRuntimeRecord>;
  conversationSessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: HostCallPayload['method'];
  params: JsonObject;
  runSubagentRequest: (input: {
    pluginId: string;
    context: PluginCallContext;
    request: unknown;
  }) => Promise<unknown>;
};

@Injectable()
export class PluginRuntimeHostFacade {
  private chatMessageService?: ChatMessageService;
  private subagentTaskService?: {
    startTask: (input: {
      pluginId: string;
      pluginDisplayName?: string;
      runtimeKind: PluginRuntimeKind;
      context: PluginCallContext;
      request: unknown;
      writeBackTarget?: unknown;
    }) => Promise<unknown>;
    listTasksForPlugin: (pluginId: string) => Promise<unknown>;
    getTaskForPlugin: (pluginId: string, taskId: string) => Promise<unknown>;
  };

  constructor(
    private readonly pluginService: PluginService,
    private readonly hostService: PluginHostService,
    private readonly runtimeAutomationFacade: PluginRuntimeAutomationFacade,
    private readonly moduleRef: ModuleRef,
  ) {}

  async call(input: RuntimeHostCallInput): Promise<JsonValue> {
    const record = this.resolvePermittedRuntimeRecord(
      input.records,
      input.pluginId,
      input.method,
    );

    const automationResult = await this.runtimeAutomationFacade.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
    if (automationResult.handled) {
      return automationResult.value;
    }

    const runtimeManagedResult = await this.callRuntimeManagedMethod({
      ...input,
      record,
    });
    if (typeof runtimeManagedResult !== 'undefined') {
      return runtimeManagedResult;
    }

    return this.hostService.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
  }

  private resolvePermittedRuntimeRecord(
    records: Map<string, PluginRuntimeRecord>,
    pluginId: string,
    method: PluginHostMethod,
  ): PluginRuntimeRecord | undefined {
    const record = method === 'plugin.self.get'
      ? records.get(pluginId)
      : getRuntimeRecordOrThrow(records, pluginId);
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[method];
    if (
      requiredPermission
      && record
      && !record.manifest.permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException(`插件 ${pluginId} 缺少权限 ${requiredPermission}`);
    }

    return record;
  }

  private async getPluginSelfValue(
    pluginId: string,
    record: PluginRuntimeRecord | undefined,
  ): Promise<JsonValue> {
    return toJsonValue(record
      ? buildRuntimePluginSelfInfo({
        manifest: record.manifest,
        runtimeKind: record.runtimeKind,
        supportedActions: record.transport.listSupportedActions?.() ?? ['health-check'],
      })
      : buildStoredPluginSelfInfo({
        plugin: await this.pluginService.getPluginSelfInfo(pluginId),
      }));
  }

  private async callRuntimeManagedMethod(
    input: RuntimeHostCallInput & {
      record: PluginRuntimeRecord | undefined;
    },
  ): Promise<JsonValue | undefined> {
    switch (input.method) {
      case 'plugin.self.get':
        return this.getPluginSelfValue(input.pluginId, input.record);
      case 'subagent.run':
        return toJsonValue(await input.runSubagentRequest({
          pluginId: input.pluginId,
          context: input.context,
          request: readRuntimeSubagentRequest(input.params, input.method),
        }));
      case 'message.target.current.get':
      case 'message.send':
        return this.callMessageMethod(input);
      case 'conversation.session.start':
      case 'conversation.session.get':
      case 'conversation.session.keep':
      case 'conversation.session.finish':
        return this.callConversationSessionMethod(input);
      case 'subagent.task.start':
      case 'subagent.task.list':
      case 'subagent.task.get':
        return this.callSubagentTaskMethod(input);
      default:
        return undefined;
    }
  }

  private async callMessageMethod(input: RuntimeHostCallInput): Promise<JsonValue> {
    const chatMessageService = await this.getChatMessageService();
    if (input.method === 'message.target.current.get') {
      return toJsonValue(await chatMessageService.getCurrentPluginMessageTarget({
        context: input.context,
      }));
    }

    return toJsonValue(await chatMessageService.sendPluginMessage({
      context: input.context,
      target: readOptionalRuntimeMessageTarget(input.params, 'target', input.method),
      content: readOptionalRuntimeString(input.params, 'content', input.method),
      parts: readOptionalRuntimeChatMessageParts(input.params, 'parts', input.method),
      provider: readOptionalRuntimeString(input.params, 'provider', input.method),
      model: readOptionalRuntimeString(input.params, 'model', input.method),
    }));
  }

  private callConversationSessionMethod(input: RuntimeHostCallInput): JsonValue {
    const baseInput = {
      sessions: input.conversationSessions,
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
    };
    const now = Date.now();

    if (input.method === 'conversation.session.start') {
      return toJsonValue(startConversationSessionForRuntime({
        ...baseInput,
        timeoutMs: requirePositiveRuntimeNumber(
          input.params,
          'timeoutMs',
          input.method,
        ),
        captureHistory: readOptionalRuntimeBoolean(
          input.params,
          'captureHistory',
          input.method,
        ) ?? false,
        metadata: readOptionalRuntimeJsonValue(input.params, 'metadata'),
        now,
      }));
    }
    if (input.method === 'conversation.session.get') {
      return toJsonValue(getConversationSessionInfoForRuntime({
        ...baseInput,
        now,
      }));
    }
    if (input.method === 'conversation.session.keep') {
      return toJsonValue(keepConversationSessionForRuntime({
        ...baseInput,
        timeoutMs: requirePositiveRuntimeNumber(
          input.params,
          'timeoutMs',
          input.method,
        ),
        resetTimeout: readOptionalRuntimeBoolean(
          input.params,
          'resetTimeout',
          input.method,
        ) ?? true,
        now,
      }));
    }

    return finishConversationSessionForRuntime({
      ...baseInput,
    });
  }

  private async callSubagentTaskMethod(
    input: RuntimeHostCallInput & {
      record: PluginRuntimeRecord | undefined;
    },
  ): Promise<JsonValue> {
    const subagentTaskService = await this.getSubagentTaskService();
    const baseTaskInput = {
      pluginId: input.pluginId,
      pluginDisplayName: input.record?.manifest.name,
      runtimeKind: input.record?.runtimeKind ?? 'builtin',
      context: input.context,
    };

    if (input.method === 'subagent.task.start') {
      const taskParams = readRuntimeSubagentTaskStartParams(
        input.params,
        input.method,
      );
      return toJsonValue(await subagentTaskService.startTask({
        ...baseTaskInput,
        request: taskParams.request,
        ...(taskParams.writeBackTarget
          ? { writeBackTarget: taskParams.writeBackTarget }
          : {}),
      }));
    }
    if (input.method === 'subagent.task.list') {
      return toJsonValue(await subagentTaskService.listTasksForPlugin(input.pluginId));
    }

    return toJsonValue(await subagentTaskService.getTaskForPlugin(
      input.pluginId,
      requireRuntimeString(input.params, 'taskId', input.method),
    ));
  }

  private async getChatMessageService(): Promise<ChatMessageService> {
    return resolveCachedRuntimeServiceAsync({
      current: this.chatMessageService,
      resolve: async () => this.moduleRef.get(ChatMessageService, { strict: false }),
      cache: (value) => {
        this.chatMessageService = value;
      },
      notFoundMessage: 'ChatMessageService is not available',
    });
  }

  private async getSubagentTaskService() {
    return resolveCachedRuntimeServiceAsync({
      current: this.subagentTaskService,
      resolve: async () =>
        this.moduleRef.get<typeof this.subagentTaskService>(
          'PLUGIN_SUBAGENT_TASK_SERVICE',
          { strict: false },
        ),
      cache: (value) => {
        this.subagentTaskService = value;
      },
      notFoundMessage: 'PluginSubagentTaskService is not available',
    });
  }
}
