import type { PluginCallContext, PluginHookName } from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';

type DispatchableHookRecord = {
  manifest: {
    id: string;
  };
};

type PassHookResult = {
  action: 'pass';
};

type MutateHookResult = {
  action: 'mutate';
};

type ShortCircuitHookResult = {
  action: 'short-circuit';
};

export async function runMutatingHookChain<
  TPayload,
  TResult extends PassHookResult | { action: string },
>(input: {
  records: Iterable<DispatchableHookRecord>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: (input: {
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
  }) => Promise<unknown>;
  normalizeResult: (raw: JsonValue | undefined) => TResult | null;
  applyMutation: (payload: TPayload, result: Exclude<TResult, PassHookResult>) => TPayload;
}): Promise<TPayload> {
  let payload = input.payload;

  for (const record of input.records) {
    try {
      const rawResult = await input.invokeHook({
        pluginId: record.manifest.id,
        hookName: input.hookName,
        context: input.context,
        payload: toJsonValue(payload),
      });
      const hookResult = input.normalizeResult(rawResult as JsonValue | undefined);

      if (!hookResult || hookResult.action === 'pass') {
        continue;
      }

      payload = input.applyMutation(
        payload,
        hookResult as Exclude<TResult, PassHookResult>,
      );
    } catch {
      // 单个 Hook 失败时继续后续插件；失败记录由调用侧的 invokeHook 负责。
    }
  }

  return payload;
}

export async function runShortCircuitingHookChain<
  TPayload,
  TResult extends PassHookResult | MutateHookResult | ShortCircuitHookResult,
  TShortCircuitReturn extends { action: 'short-circuit' },
>(input: {
  records: Iterable<DispatchableHookRecord>;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: (input: {
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
  }) => Promise<unknown>;
  normalizeResult: (
    raw: JsonValue | undefined,
  ) => TResult | null;
  applyMutation: (payload: TPayload, result: Extract<TResult, MutateHookResult>) => TPayload;
  buildShortCircuitReturn: (input: {
    payload: TPayload;
    result: Extract<TResult, ShortCircuitHookResult>;
  }) => Promise<TShortCircuitReturn> | TShortCircuitReturn;
}): Promise<
  | { action: 'continue'; payload: TPayload }
  | TShortCircuitReturn
> {
  let payload = input.payload;

  for (const record of input.records) {
    try {
      const rawResult = await input.invokeHook({
        pluginId: record.manifest.id,
        hookName: input.hookName,
        context: input.context,
        payload: toJsonValue(payload),
      });
      const hookResult = input.normalizeResult(rawResult as JsonValue | undefined);

      if (!hookResult || hookResult.action === 'pass') {
        continue;
      }
      if (hookResult.action === 'short-circuit') {
        return input.buildShortCircuitReturn({
          payload,
          result: hookResult as Extract<TResult, ShortCircuitHookResult>,
        });
      }

      payload = input.applyMutation(payload, hookResult as Extract<TResult, MutateHookResult>);
    } catch {
      // 单个 Hook 失败时继续后续插件；失败记录由调用侧的 invokeHook 负责。
    }
  }

  return {
    action: 'continue',
    payload,
  };
}
