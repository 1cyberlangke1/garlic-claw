import {
  PLUGIN_HOST_METHOD_PERMISSION_MAP,
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
  runOwnedConversationSessionMethod,
} from '@garlic-claw/shared';
import type { ConversationSessionRecord, HostCallPayload, PluginCallContext, PluginRuntimeKind, PluginSubagentRequest, PluginSubagentRunResult } from '@garlic-claw/shared';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { ChatMessageService } from '../chat/chat-message.service';
import {
  readRuntimeConversationSessionCall,
  readRuntimeMessageSendInput,
  readRuntimeSubagentTaskCall,
  requireRuntimeContextField,
} from './plugin-runtime-request.codec';
import type { PluginRuntimeRecord } from './plugin-runtime.types';
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
  runSubagentRequest: (input: { pluginId: string; context: PluginCallContext; request: PluginSubagentRequest }) => Promise<PluginSubagentRunResult>;
};
type PluginSubagentTaskServicePort = {
  startTask: (input: { pluginId: string; pluginDisplayName?: string; runtimeKind: PluginRuntimeKind; context: PluginCallContext; request: unknown; writeBackTarget?: unknown }) => Promise<unknown>;
  listTasksForPlugin: (pluginId: string) => Promise<unknown>;
  getTaskForPlugin: (pluginId: string, taskId: string) => Promise<unknown>;
};

function resolveCachedModuleService<T>(input: {
  current: T | undefined;
  resolve: () => T | undefined;
  cache: (value: T) => void;
  notFoundMessage: string;
}): T {
  if (input.current) {
    return input.current;
  }

  const resolved = input.resolve();
  if (!resolved) {
    throw new NotFoundException(input.notFoundMessage);
  }

  input.cache(resolved);
  return resolved;
}

@Injectable()
export class PluginRuntimeHostFacade {
  private chatMessageService?: ChatMessageService;
  private subagentTaskService?: PluginSubagentTaskServicePort;

  constructor(
    private readonly pluginService: PluginService,
    private readonly hostService: PluginHostService,
    private readonly runtimeAutomationFacade: PluginRuntimeAutomationFacade,
    private readonly moduleRef: ModuleRef,
  ) {}

  async call(input: RuntimeHostCallInput): Promise<JsonValue> {
    const record = input.records.get(input.pluginId);
    if (!record && input.method !== 'plugin.self.get') {
      throw new NotFoundException(`Plugin not found: ${input.pluginId}`);
    }
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[input.method];
    if (
      requiredPermission
      && record
      && !record.manifest.permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException(`插件 ${input.pluginId} 缺少权限 ${requiredPermission}`);
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
    if (input.method === 'plugin.self.get') {
      return toJsonValue(record
        ? buildRuntimePluginSelfInfo({
          manifest: record.manifest,
          runtimeKind: record.runtimeKind,
          supportedActions: record.transport.listSupportedActions?.() ?? ['health-check'],
        })
        : buildStoredPluginSelfInfo({
          plugin: await this.pluginService.getPluginSelfInfo(input.pluginId),
        }));
    }
    if (input.method.startsWith('message.')) {
      return toJsonValue(await this.callMessageMethod(input));
    }
    if (input.method.startsWith('conversation.session.')) {
      return toJsonValue(this.callConversationSessionMethod(input));
    }
    if (input.method.startsWith('subagent.')) {
      return toJsonValue(await this.callSubagentMethod({
        ...input,
        record,
      }));
    }

    return this.hostService.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
  }

  private async callMessageMethod(input: RuntimeHostCallInput): Promise<unknown> {
    const chatMessageService = this.getChatMessageService();
    if (input.method === 'message.target.current.get') {
      return chatMessageService.getCurrentPluginMessageTarget({ context: input.context });
    }

    return chatMessageService.sendPluginMessage({
      context: input.context,
      ...readRuntimeMessageSendInput(input.params, 'message.send'),
    });
  }

  private callConversationSessionMethod(input: RuntimeHostCallInput): unknown {
    return runOwnedConversationSessionMethod({
      sessions: input.conversationSessions,
      pluginId: input.pluginId,
      conversationId: requireRuntimeContextField(
        input.context,
        'conversationId',
        input.method,
      ),
      now: Date.now(),
      ...readRuntimeConversationSessionCall(
        input.params,
        input.method as
          | 'conversation.session.start'
          | 'conversation.session.get'
          | 'conversation.session.keep'
          | 'conversation.session.finish',
      ),
    });
  }

  private async callSubagentMethod(
    input: RuntimeHostCallInput & {
      record: PluginRuntimeRecord | undefined;
    },
  ): Promise<unknown> {
    const subagentCall = readRuntimeSubagentTaskCall(
      input.params,
      input.method as
        | 'subagent.run'
        | 'subagent.task.list'
        | 'subagent.task.get'
        | 'subagent.task.start',
    );
    if (subagentCall.subagentMethod === 'run') {
      return input.runSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: subagentCall.request,
      });
    }

    const subagentTaskService = this.getSubagentTaskService();
    if (subagentCall.subagentMethod === 'list') {
      return subagentTaskService.listTasksForPlugin(input.pluginId);
    }
    if (subagentCall.subagentMethod === 'get') {
      return subagentTaskService.getTaskForPlugin(
        input.pluginId,
        subagentCall.taskId,
      );
    }

    return subagentTaskService.startTask({
      pluginId: input.pluginId,
      pluginDisplayName: input.record?.manifest.name,
      runtimeKind: input.record?.runtimeKind ?? 'builtin',
      context: input.context,
      request: subagentCall.request,
      ...(subagentCall.writeBackTarget
        ? { writeBackTarget: subagentCall.writeBackTarget }
        : {}),
    });
  }

  private getChatMessageService(): ChatMessageService {
    return resolveCachedModuleService({
      current: this.chatMessageService,
      resolve: () =>
        this.moduleRef.get(ChatMessageService, { strict: false }),
      cache: (value) => {
        this.chatMessageService = value;
      },
      notFoundMessage: 'ChatMessageService is not available',
    });
  }

  private getSubagentTaskService(): PluginSubagentTaskServicePort {
    return resolveCachedModuleService({
      current: this.subagentTaskService,
      resolve: () =>
        this.moduleRef.get<PluginSubagentTaskServicePort>(
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
