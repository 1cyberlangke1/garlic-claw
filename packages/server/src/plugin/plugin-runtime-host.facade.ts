import { PLUGIN_HOST_METHOD_PERMISSION_MAP } from '@garlic-claw/shared';
import type {
  ConversationSessionRecord,
  HostCallPayload,
  PluginActionName,
  PluginCallContext,
  PluginHostMethod,
  PluginManifest,
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
import {
  finishConversationSessionForRuntime,
  getConversationSessionInfoForRuntime,
  keepConversationSessionForRuntime,
  startConversationSessionForRuntime,
} from './plugin-runtime-session.helpers';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';
import { PluginHostService } from './plugin-host.service';
import { PluginService } from './plugin.service';

const HOST_CALL_UNHANDLED = Symbol('HOST_CALL_UNHANDLED');

interface RuntimeHostFacadeRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  transport: {
    listSupportedActions?: () => PluginActionName[];
  };
}

type RuntimeHostCallInput = {
  records: Map<string, RuntimeHostFacadeRecord>;
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
    const record = this.resolveRuntimeRecord(input.records, input.pluginId, input.method);
    this.ensurePermission(input.pluginId, input.method, record);

    if (input.method === 'plugin.self.get') {
      return this.getPluginSelfValue(input.pluginId, record);
    }
    if (input.method === 'subagent.run') {
      return toJsonValue(await input.runSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: readRuntimeSubagentRequest(input.params, 'subagent.run'),
      }));
    }

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
    if (runtimeManagedResult !== HOST_CALL_UNHANDLED) {
      return runtimeManagedResult;
    }

    return this.hostService.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
  }

  private resolveRuntimeRecord(
    records: Map<string, RuntimeHostFacadeRecord>,
    pluginId: string,
    method: PluginHostMethod,
  ) {
    return method === 'plugin.self.get'
      ? records.get(pluginId)
      : getRuntimeRecordOrThrow(records, pluginId);
  }

  private ensurePermission(
    pluginId: string,
    method: PluginHostMethod,
    record: RuntimeHostFacadeRecord | undefined,
  ) {
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[method];
    if (
      requiredPermission
      && record
      && !record.manifest.permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException(`插件 ${pluginId} 缺少权限 ${requiredPermission}`);
    }
  }

  private async getPluginSelfValue(
    pluginId: string,
    record: RuntimeHostFacadeRecord | undefined,
  ): Promise<JsonValue> {
    if (!record) {
      return toJsonValue(
        buildStoredPluginSelfInfo({
          plugin: await this.pluginService.getPluginSelfInfo(pluginId),
        }),
      );
    }

    return toJsonValue(
      buildRuntimePluginSelfInfo({
        manifest: record.manifest,
        runtimeKind: record.runtimeKind,
        supportedActions: record.transport.listSupportedActions?.() ?? ['health-check'],
      }),
    );
  }

  private async callRuntimeManagedMethod(
    input: RuntimeHostCallInput & {
      record: RuntimeHostFacadeRecord | undefined;
    },
  ): Promise<JsonValue | typeof HOST_CALL_UNHANDLED> {
    switch (input.method) {
      case 'message.target.current.get':
        return this.getCurrentMessageTarget(input.context);
      case 'message.send':
        return this.sendPluginMessage(input.context, input.params);
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
        return HOST_CALL_UNHANDLED;
    }
  }

  private async getCurrentMessageTarget(context: PluginCallContext): Promise<JsonValue> {
    return toJsonValue(await (await this.getChatMessageService()).getCurrentPluginMessageTarget({
      context,
    }));
  }

  private async sendPluginMessage(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    return toJsonValue(await (await this.getChatMessageService()).sendPluginMessage({
      context,
      target: readOptionalRuntimeMessageTarget(params, 'target', 'message.send'),
      content: readOptionalRuntimeString(params, 'content', 'message.send'),
      parts: readOptionalRuntimeChatMessageParts(params, 'parts', 'message.send'),
      provider: readOptionalRuntimeString(params, 'provider', 'message.send'),
      model: readOptionalRuntimeString(params, 'model', 'message.send'),
    }));
  }

  private callConversationSessionMethod(
    input: RuntimeHostCallInput,
  ): JsonValue | typeof HOST_CALL_UNHANDLED {
    switch (input.method) {
      case 'conversation.session.start':
        return toJsonValue(startConversationSessionForRuntime({
          sessions: input.conversationSessions,
          pluginId: input.pluginId,
          context: input.context,
          method: input.method,
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
          now: Date.now(),
        }));
      case 'conversation.session.get':
        return toJsonValue(getConversationSessionInfoForRuntime({
          sessions: input.conversationSessions,
          pluginId: input.pluginId,
          context: input.context,
          method: input.method,
          now: Date.now(),
        }));
      case 'conversation.session.keep':
        return toJsonValue(keepConversationSessionForRuntime({
          sessions: input.conversationSessions,
          pluginId: input.pluginId,
          context: input.context,
          method: input.method,
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
          now: Date.now(),
        }));
      case 'conversation.session.finish':
        return finishConversationSessionForRuntime({
          sessions: input.conversationSessions,
          pluginId: input.pluginId,
          context: input.context,
          method: input.method,
        });
      default:
        return HOST_CALL_UNHANDLED;
    }
  }

  private async callSubagentTaskMethod(
    input: RuntimeHostCallInput & {
      record: RuntimeHostFacadeRecord | undefined;
    },
  ): Promise<JsonValue | typeof HOST_CALL_UNHANDLED> {
    const subagentTaskService = await this.getSubagentTaskService();
    switch (input.method) {
      case 'subagent.task.start': {
        const taskParams = readRuntimeSubagentTaskStartParams(
          input.params,
          input.method,
        );
        return toJsonValue(await subagentTaskService.startTask({
          pluginId: input.pluginId,
          pluginDisplayName: input.record?.manifest.name,
          runtimeKind: input.record?.runtimeKind ?? 'builtin',
          context: input.context,
          request: taskParams.request,
          ...(taskParams.writeBackTarget
            ? { writeBackTarget: taskParams.writeBackTarget }
            : {}),
        }));
      }
      case 'subagent.task.list':
        return toJsonValue(await subagentTaskService.listTasksForPlugin(input.pluginId));
      case 'subagent.task.get':
        return toJsonValue(await subagentTaskService.getTaskForPlugin(
          input.pluginId,
          requireRuntimeString(input.params, 'taskId', input.method),
        ));
      default:
        return HOST_CALL_UNHANDLED;
    }
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
