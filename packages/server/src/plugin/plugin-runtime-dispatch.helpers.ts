import type {
  PluginCallContext,
  PluginHookDescriptor,
  PluginHookName,
  PluginManifest,
} from '@garlic-claw/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { toJsonValue } from '../common/utils/json-value';
import type { JsonValue } from '../common/types/json-value';
import type { PluginGovernanceSnapshot } from './plugin.service';
import {
  getPluginHookPriority,
  matchesHookFilter,
} from './plugin-runtime-hook-filter.helpers';
import { findManifestHookDescriptor } from './plugin-runtime-manifest.helpers';
import { isPluginEnabledForContext } from './plugin-runtime-scope';

type RuntimeDispatchRecord = {
  manifest: PluginManifest;
  governance: Pick<PluginGovernanceSnapshot, 'scope'>;
};

export function getRuntimeRecordOrThrow<T extends { manifest: Pick<PluginManifest, 'id'> }>(
  records: ReadonlyMap<string, T>,
  pluginId: string,
): T {
  const record = records.get(pluginId);
  if (!record) {
    throw new NotFoundException(`Plugin not found: ${pluginId}`);
  }

  return record;
}

export function isRuntimeRecordEnabledForContext(
  record: RuntimeDispatchRecord,
  context: PluginCallContext,
): boolean {
  return isPluginEnabledForContext(record.governance.scope, context);
}

export function assertRuntimeRecordEnabled(
  record: RuntimeDispatchRecord,
  context: PluginCallContext,
): void {
  if (isRuntimeRecordEnabledForContext(record, context)) {
    return;
  }

  throw new ForbiddenException(
    `插件 ${record.manifest.id} 在当前作用域已禁用`,
  );
}

export function listDispatchableHookRecords<T extends RuntimeDispatchRecord>(input: {
  records: Iterable<T>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload?: unknown;
}): T[] {
  return [...input.records]
    .map((record) => ({
      record,
      hook: findManifestHookDescriptor(record.manifest, input.hookName),
    }))
    .filter((entry): entry is { record: T; hook: PluginHookDescriptor } =>
      entry.hook !== null,
    )
    .filter((entry) =>
      isRuntimeRecordEnabledForContext(entry.record, input.context)
      && matchesHookFilter(entry.hook, input.hookName, input.payload),
    )
    .sort((left, right) => {
      const priorityDiff = getPluginHookPriority(left.hook) - getPluginHookPriority(right.hook);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return left.record.manifest.id.localeCompare(right.record.manifest.id);
    })
    .map((entry) => entry.record);
}

export async function invokeDispatchableHooks<
  T extends RuntimeDispatchRecord,
  TResult,
>(input: {
  records: Iterable<T>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload?: unknown;
  invoke: (record: T, payload: JsonValue) => Promise<TResult>;
}): Promise<TResult[]> {
  const results: TResult[] = [];
  const payload = toJsonValue(input.payload);

  for (const record of listDispatchableHookRecords({
    records: input.records,
    hookName: input.hookName,
    context: input.context,
    payload: input.payload,
  })) {
    try {
      results.push(await input.invoke(record, payload));
    } catch {
      // 单个 Hook 失败时继续执行后续插件。
    }
  }

  return results;
}
