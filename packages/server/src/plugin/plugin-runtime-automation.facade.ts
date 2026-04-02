import type {
  HostCallPayload,
  PluginCallContext,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AutomationService } from '../automation/automation.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import {
  readOptionalRuntimeBoolean,
  readOptionalRuntimeJsonValue,
  readOptionalRuntimeString,
  readRuntimeAutomationActions,
  readRuntimeAutomationTrigger,
  requireRuntimeString,
  requireRuntimeUserId,
} from './plugin-runtime-input.helpers';
import { resolveCachedRuntimeService } from './plugin-runtime-module.helpers';
import { PluginCronService } from './plugin-cron.service';

interface PluginRuntimeAutomationCallInput {
  pluginId: string;
  context: PluginCallContext;
  method: HostCallPayload['method'];
  params: JsonObject;
}

type PluginRuntimeAutomationCallResult =
  | { handled: false }
  | { handled: true; value: JsonValue };

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
    if (input.method === 'automation.create') {
      return {
        handled: true,
        value: toJsonValue(
          await this.getAutomationService().create(
            requireRuntimeUserId(input.context, 'automation.create'),
            requireRuntimeString(input.params, 'name', 'automation.create'),
            readRuntimeAutomationTrigger(input.params, 'automation.create'),
            readRuntimeAutomationActions(input.params, 'automation.create'),
          ),
        ),
      };
    }
    if (input.method === 'automation.list') {
      return {
        handled: true,
        value: toJsonValue(
          await this.getAutomationService().findAllByUser(
            requireRuntimeUserId(input.context, 'automation.list'),
          ),
        ),
      };
    }
    if (input.method === 'automation.event.emit') {
      return {
        handled: true,
        value: toJsonValue(
          await this.getAutomationService().emitEvent(
            requireRuntimeString(input.params, 'event', 'automation.event.emit'),
            requireRuntimeUserId(input.context, 'automation.event.emit'),
          ),
        ),
      };
    }
    if (input.method === 'automation.toggle') {
      return {
        handled: true,
        value: toJsonValue(
          await this.getAutomationService().toggle(
            requireRuntimeString(input.params, 'automationId', 'automation.toggle'),
            requireRuntimeUserId(input.context, 'automation.toggle'),
          ),
        ),
      };
    }
    if (input.method === 'automation.run') {
      return {
        handled: true,
        value: toJsonValue(
          await this.getAutomationService().executeAutomation(
            requireRuntimeString(input.params, 'automationId', 'automation.run'),
            requireRuntimeUserId(input.context, 'automation.run'),
          ),
        ),
      };
    }
    if (input.method === 'cron.register') {
      return {
        handled: true,
        value: toJsonValue(await this.cronService.registerCron(input.pluginId, {
          name: requireRuntimeString(input.params, 'name', 'cron.register'),
          cron: requireRuntimeString(input.params, 'cron', 'cron.register'),
          description: readOptionalRuntimeString(input.params, 'description', 'cron.register'),
          data: readOptionalRuntimeJsonValue(input.params, 'data'),
          enabled: readOptionalRuntimeBoolean(input.params, 'enabled', 'cron.register'),
        })),
      };
    }
    if (input.method === 'cron.list') {
      return {
        handled: true,
        value: toJsonValue(await this.cronService.listCronJobs(input.pluginId)),
      };
    }
    if (input.method === 'cron.delete') {
      return {
        handled: true,
        value: toJsonValue(await this.cronService.deleteCron(
          input.pluginId,
          requireRuntimeString(input.params, 'jobId', 'cron.delete'),
        )),
      };
    }

    return {
      handled: false,
    };
  }

  private getAutomationService(): AutomationService {
    return resolveCachedRuntimeService({
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
