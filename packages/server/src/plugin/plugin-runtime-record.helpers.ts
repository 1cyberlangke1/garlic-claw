import type {
  PluginActionName,
  PluginRuntimePressureSnapshot,
} from '@garlic-claw/shared';
import {
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { JsonObject } from '../common/types/json-value';
import type { PluginGovernanceSnapshot } from './plugin.service';

const PLUGIN_ACTION_ORDER: PluginActionName[] = [
  'health-check',
  'reload',
  'reconnect',
];

export const DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS = 6;

export function resolveMaxConcurrentExecutions(
  governance: Pick<PluginGovernanceSnapshot, 'resolvedConfig'>,
): number {
  const raw = governance.resolvedConfig.maxConcurrentExecutions;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(32, Math.max(1, Math.trunc(raw)));
  }

  return DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS;
}

export function buildRuntimePressureSnapshot(input: {
  activeExecutions: number;
  maxConcurrentExecutions: number;
}): PluginRuntimePressureSnapshot {
  return {
    activeExecutions: input.activeExecutions,
    maxConcurrentExecutions: input.maxConcurrentExecutions,
  };
}

export function listSupportedPluginActions(input: {
  transport: {
    listSupportedActions?(): PluginActionName[];
  };
}): PluginActionName[] {
  const actions = input.transport.listSupportedActions?.() ?? ['health-check'];
  const actionSet = new Set<PluginActionName>(actions);

  return PLUGIN_ACTION_ORDER.filter((action) => actionSet.has(action));
}

export async function runWithRuntimeExecutionSlot<T>(input: {
  record: {
    manifest: {
      id: string;
    };
    activeExecutions: number;
    maxConcurrentExecutions: number;
  };
  type: 'tool' | 'route' | 'hook';
  metadata: JsonObject;
  recordPluginEvent: (
    pluginId: string,
    event: {
      type: string;
      level: 'warn';
      message: string;
      metadata: JsonObject;
    },
  ) => Promise<void>;
  execute: () => Promise<T>;
}): Promise<T> {
  if (input.record.activeExecutions >= input.record.maxConcurrentExecutions) {
    const pressure = buildRuntimePressureSnapshot(input.record);
    const message = `插件 ${input.record.manifest.id} 当前执行并发已达上限，请稍后重试`;
    await input.recordPluginEvent(input.record.manifest.id, {
      type: `${input.type}:overloaded`,
      level: 'warn',
      message,
      metadata: {
        ...input.metadata,
        activeExecutions: pressure.activeExecutions,
        maxConcurrentExecutions: pressure.maxConcurrentExecutions,
      },
    });
    throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  input.record.activeExecutions += 1;
  try {
    return await input.execute();
  } finally {
    input.record.activeExecutions = Math.max(0, input.record.activeExecutions - 1);
  }
}

export function isPluginOverloadedError(error: unknown): boolean {
  return error instanceof HttpException
    && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
}
