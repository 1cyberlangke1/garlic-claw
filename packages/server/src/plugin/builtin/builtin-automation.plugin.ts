import {
  createAutomationCreatedResult,
  readRequiredStringParam,
  readOptionalStringParam,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';

export const BUILTIN_AUTOMATION_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: {
    description: '提供自动化任务的创建与管理。',
    id: 'builtin.automation',
    name: '自动化',
    permissions: ['automation:read', 'automation:write'],
    runtime: 'local',
    tools: [
      {
        description: '创建一个自动化任务。trigger_type 可选 cron（定时）、event（事件触发）或 manual（手动）。cron 类型的表达式如 "*/5 * * * *" 表示每 5 分钟。action_type 可选 ai_message（发送 AI 消息）或 device_command（设备命令）。',
        name: 'create_automation',
        parameters: {
          name: {
            description: '自动化任务名称',
            required: true,
            type: 'string',
          },
          trigger_type: {
            description: '触发类型：cron、event 或 manual',
            required: true,
            type: 'string',
          },
          trigger_cron: {
            description: 'cron 表达式，trigger_type 为 cron 时必填',
            type: 'string',
          },
          trigger_event: {
            description: '事件名称，trigger_type 为 event 时必填',
            type: 'string',
          },
          action_type: {
            description: '动作类型：ai_message 或 device_command',
            required: true,
            type: 'string',
          },
          action_message: {
            description: 'AI 消息内容，action_type 为 ai_message 时必填',
            type: 'string',
          },
          action_command: {
            description: '设备命令，action_type 为 device_command 时必填',
            type: 'string',
          },
        },
      },
    ],
    version: '1.0.0',
  },
  tools: {
    create_automation: async (params, context) => {
      const name = readRequiredStringParam(params, 'name');
      const triggerType = readRequiredStringParam(params, 'trigger_type') as 'cron' | 'event' | 'manual';
      const triggerCron = readOptionalStringParam(params, 'trigger_cron');
      const triggerEvent = readOptionalStringParam(params, 'trigger_event');
      const actionType = readRequiredStringParam(params, 'action_type') as 'ai_message' | 'device_command';
      const actionMessage = readOptionalStringParam(params, 'action_message');
      const actionCommand = readOptionalStringParam(params, 'action_command');

      const trigger: Record<string, unknown> = { type: triggerType };
      if (triggerType === 'cron' && triggerCron) {
        trigger.cron = triggerCron;
      } else if (triggerType === 'event' && triggerEvent) {
        trigger.event = triggerEvent;
      }

      const action: Record<string, unknown> = { type: actionType };
      if (actionType === 'ai_message' && actionMessage) {
        action.message = actionMessage;
      } else if (actionType === 'device_command' && actionCommand) {
        action.command = actionCommand;
      }

      const result = await context.host.createAutomation({
        name,
        trigger: trigger as { type: 'cron' | 'event' | 'manual'; cron?: string; event?: string },
        actions: [action as { type: 'ai_message' | 'device_command'; message?: string; command?: string }],
      });

      return createAutomationCreatedResult({ id: result.id, name: result.name });
    },
  },
};
