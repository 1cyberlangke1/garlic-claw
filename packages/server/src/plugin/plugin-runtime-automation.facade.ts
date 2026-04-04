import type {
  ActionConfig,
  HostCallPayload,
  PluginCallContext,
  TriggerConfig,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AutomationService } from '../automation/automation.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import {
  readOptionalBooleanValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';
import { PluginCronService } from './plugin-cron.service';
import {
  readOptionalRuntimeMessageTarget,
  readOptionalRuntimeValue,
  requireRuntimeContextField,
  requireRuntimeJsonObjectValue,
  requireRuntimeStringValue,
} from './plugin-runtime-request.codec';

interface PluginRuntimeAutomationCallInput {
  pluginId: string;
  context: PluginCallContext;
  method: HostCallPayload['method'];
  params: JsonObject;
}

type PluginRuntimeAutomationCallResult =
  | { handled: false }
  | { handled: true; value: JsonValue };

function readOptionalRuntimeJsonValue(
  params: JsonObject,
  key: string,
): JsonValue | undefined {
  return Object.prototype.hasOwnProperty.call(params, key)
    ? params[key]
    : undefined;
}

function resolveCachedService<T>(input: {
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

function readRuntimeAutomationTrigger(
  params: JsonObject,
  method: string,
): TriggerConfig {
  const value = requireRuntimeJsonObjectValue(params.trigger, `${method} 的 trigger`);
  if (
    value.type !== 'cron'
    && value.type !== 'event'
    && value.type !== 'manual'
  ) {
    throw new BadRequestException(`${method} 的 trigger.type 不合法`);
  }

  const trigger: TriggerConfig = {
    type: value.type,
  };
  if ('cron' in value && value.cron !== undefined) {
    if (typeof value.cron !== 'string') {
      throw new BadRequestException(`${method} 的 trigger.cron 必须是字符串`);
    }
    trigger.cron = value.cron;
  }
  if ('event' in value && value.event !== undefined) {
    if (typeof value.event !== 'string') {
      throw new BadRequestException(`${method} 的 trigger.event 必须是字符串`);
    }
    trigger.event = value.event;
  }

  return trigger;
}

function readRuntimeAutomationActions(
  params: JsonObject,
  method: string,
): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${method} 的 actions 必须是数组`);
  }

  return value.map((action, index) =>
    readRuntimeAutomationAction(action, index, method),
  );
}

function readRuntimeAutomationAction(
  value: JsonValue,
  index: number,
  method: string,
): ActionConfig {
  const actionValue = requireRuntimeJsonObjectValue(
    value,
    `${method} 的 actions[${index}]`,
  );
  if (
    actionValue.type !== 'device_command'
    && actionValue.type !== 'ai_message'
  ) {
    throw new BadRequestException(`${method} 的 actions[${index}].type 不合法`);
  }

  if (actionValue.type === 'device_command') {
    if (typeof actionValue.plugin !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].plugin 必须是字符串`,
      );
    }
    if (typeof actionValue.capability !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].capability 必须是字符串`,
      );
    }

    const action: ActionConfig = {
      type: actionValue.type,
      plugin: actionValue.plugin,
      capability: actionValue.capability,
    };
    if ('params' in actionValue && actionValue.params !== undefined) {
      action.params = requireRuntimeJsonObjectValue(
        actionValue.params,
        `${method} 的 actions[${index}].params`,
      );
    }

    return action;
  }

  const action: ActionConfig = {
    type: actionValue.type,
  };
  if ('message' in actionValue && actionValue.message !== undefined) {
    if (typeof actionValue.message !== 'string') {
      throw new BadRequestException(
        `${method} 的 actions[${index}].message 必须是字符串`,
      );
    }
    action.message = actionValue.message;
  }
  if ('target' in actionValue && actionValue.target !== undefined) {
    action.target = readOptionalRuntimeMessageTarget(
      actionValue,
      'target',
      `${method}.actions[${index}]`,
    );
  }

  return action;
}

@Injectable()
export class PluginRuntimeAutomationFacade {
  private automationService?: AutomationService;

  constructor(
    private readonly cronService: PluginCronService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async call(
    input: PluginRuntimeAutomationCallInput,
  ): Promise<PluginRuntimeAutomationCallResult> {
    const automationService = this.getAutomationService();
    if (input.method === 'automation.create') {
      return this.toHandledResult(
        automationService.create(
          requireRuntimeContextField(input.context, 'userId', 'automation.create'),
          requireRuntimeStringValue(input.params.name, 'automation.create 的 name'),
          readRuntimeAutomationTrigger(input.params, 'automation.create'),
          readRuntimeAutomationActions(input.params, 'automation.create'),
        ),
      );
    }
    if (input.method === 'automation.list') {
      return this.toHandledResult(
        automationService.findAllByUser(
          requireRuntimeContextField(input.context, 'userId', 'automation.list'),
        ),
      );
    }
    if (input.method === 'automation.event.emit') {
      return this.toHandledResult(
        automationService.emitEvent(
          requireRuntimeStringValue(
            input.params.event,
            'automation.event.emit 的 event',
          ),
          requireRuntimeContextField(input.context, 'userId', 'automation.event.emit'),
        ),
      );
    }
    if (input.method === 'automation.toggle') {
      return this.toHandledResult(
        automationService.toggle(
          requireRuntimeStringValue(
            input.params.automationId,
            'automation.toggle 的 automationId',
          ),
          requireRuntimeContextField(input.context, 'userId', 'automation.toggle'),
        ),
      );
    }
    if (input.method === 'automation.run') {
      return this.toHandledResult(
        automationService.executeAutomation(
          requireRuntimeStringValue(
            input.params.automationId,
            'automation.run 的 automationId',
          ),
          requireRuntimeContextField(input.context, 'userId', 'automation.run'),
        ),
      );
    }
    if (input.method === 'cron.register') {
      return this.toHandledResult(
        this.cronService.registerCron(input.pluginId, {
          name: requireRuntimeStringValue(input.params.name, 'cron.register 的 name'),
          cron: requireRuntimeStringValue(input.params.cron, 'cron.register 的 cron'),
          description: readOptionalRuntimeValue(
            input.params,
            'description',
            'cron.register',
            readOptionalStringValue,
          ),
          data: readOptionalRuntimeJsonValue(input.params, 'data'),
          enabled: readOptionalRuntimeValue(
            input.params,
            'enabled',
            'cron.register',
            readOptionalBooleanValue,
          ),
        }),
      );
    }
    if (input.method === 'cron.list') {
      return this.toHandledResult(this.cronService.listCronJobs(input.pluginId));
    }
    if (input.method === 'cron.delete') {
      return this.toHandledResult(
        this.cronService.deleteCron(
          input.pluginId,
          requireRuntimeStringValue(input.params.jobId, 'cron.delete 的 jobId'),
        ),
      );
    }

    return {
      handled: false,
    };
  }

  private async toHandledResult(
    value: Promise<unknown> | unknown,
  ): Promise<PluginRuntimeAutomationCallResult> {
    return {
      handled: true,
      value: toJsonValue(await value),
    };
  }

  private getAutomationService(): AutomationService {
    return resolveCachedService({
      current: this.automationService,
      resolve: () =>
        this.moduleRef.get(AutomationService, {
          strict: false,
        }),
      cache: (value) => {
        this.automationService = value;
      },
      notFoundMessage: 'AutomationService is not available',
    });
  }
}
