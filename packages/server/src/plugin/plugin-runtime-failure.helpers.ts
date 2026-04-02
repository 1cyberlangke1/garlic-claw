import type {
  PluginCallContext,
  PluginErrorHookPayload,
  PluginManifest,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import { buildPluginErrorHookPayloadForRuntimeRecord } from './plugin-runtime-manifest.helpers';

export async function recordRuntimePluginFailureAndDispatch(input: {
  pluginId: string;
  context: PluginCallContext;
  type: string;
  message: string;
  metadata?: JsonObject;
  checked?: boolean;
  skipPluginErrorHook?: boolean;
  record?: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
  } | null;
  recordFailure: (input: {
    pluginId: string;
    type: string;
    message: string;
    metadata?: JsonObject;
    checked?: boolean;
  }) => Promise<void>;
  dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
}): Promise<void> {
  await input.recordFailure({
    pluginId: input.pluginId,
    type: input.type,
    message: input.message,
    metadata: input.metadata,
    checked: input.checked,
  });

  if (input.skipPluginErrorHook) {
    return;
  }

  await input.dispatchPluginErrorHook(
    buildPluginErrorHookPayloadForRuntimeRecord({
      pluginId: input.pluginId,
      context: input.context,
      type: input.type,
      message: input.message,
      metadata: input.metadata,
      record: input.record,
    }),
  );
}
