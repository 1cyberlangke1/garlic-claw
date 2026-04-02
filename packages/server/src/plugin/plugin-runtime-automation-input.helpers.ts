import type {
  ActionConfig,
  TriggerConfig,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import {
  readOptionalRuntimeMessageTarget,
} from './plugin-runtime-message.helpers';
import { requireRuntimeJsonObjectValue } from './plugin-runtime-params.helpers';

export function readRuntimeAutomationTrigger(
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

export function readRuntimeAutomationActions(
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
