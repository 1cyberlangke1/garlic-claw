import type {
  PluginCallContext,
  PluginErrorHookPayload,
  PluginHookName,
  PluginRouteRequest,
  PluginRouteResponse,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import {
  buildPluginRouteInvocationRequest,
  buildPluginToolHookPayload,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { assertRuntimeRecordEnabled, getRuntimeRecordOrThrow } from './plugin-runtime-dispatch.helpers';
import { recordRuntimePluginFailureAndDispatch } from './plugin-runtime-failure.helpers';
import {
  isPluginOverloadedError,
  runWithRuntimeExecutionSlot,
} from './plugin-runtime-record.helpers';
import {
  findManifestRouteOrThrow,
  findManifestToolOrThrow,
} from './plugin-runtime-manifest.helpers';
import { runPromiseWithTimeout } from './plugin-runtime-timeout.helpers';
import { readRuntimeTimeoutMs } from './plugin-runtime-input.helpers';
import type {
  PluginRuntimeRecord,
  ToolBeforeCallExecutionResult,
} from './plugin-runtime.types';
import { PluginService } from './plugin.service';

type RuntimeInvocationType = 'tool' | 'route' | 'hook';

@Injectable()
export class PluginRuntimeTransportFacade {
  constructor(private readonly pluginService: PluginService) {}

  async executeTool(input: {
    records: ReadonlyMap<string, PluginRuntimeRecord>;
    pluginId: string;
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
    runToolBeforeCallHooks: (input: {
      context: PluginCallContext;
      payload: ToolBeforeCallHookPayload;
    }) => Promise<ToolBeforeCallExecutionResult>;
    runToolAfterCallHooks: (input: {
      context: PluginCallContext;
      payload: ToolAfterCallHookPayload;
    }) => Promise<ToolAfterCallHookPayload>;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<JsonValue> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);
    const targetTool = findManifestToolOrThrow(record.manifest, input.toolName);
    const lifecyclePayload = buildPluginToolHookPayload({
      pluginId: input.pluginId,
      runtimeKind: record.runtimeKind,
      label: record.manifest.name || input.pluginId,
      tool: targetTool,
      context: input.context,
      params: input.params,
    });
    let toolParams = lifecyclePayload.params;

    if (!input.skipLifecycleHooks) {
      const beforeCallResult = await input.runToolBeforeCallHooks({
        context: input.context,
        payload: lifecyclePayload,
      });

      if (beforeCallResult.action === 'short-circuit') {
        return beforeCallResult.output;
      }

      toolParams = beforeCallResult.payload.params;
    }

    const output = await this.runTimedPluginInvocation({
      record,
      context: input.context,
      type: 'tool',
      metadata: {
        toolName: input.toolName,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 30000),
      timeoutMessage: `插件 ${input.pluginId} 工具 ${input.toolName} 执行超时`,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.executeTool({
          toolName: input.toolName,
          params: toolParams,
          context: input.context,
        }),
      ),
    });

    if (input.skipLifecycleHooks) {
      return output;
    }

    const afterCallPayload = await input.runToolAfterCallHooks({
      context: input.context,
      payload: {
        ...lifecyclePayload,
        params: {
          ...toolParams,
        },
        output,
      },
    });

    return afterCallPayload.output;
  }

  async invokeRoute(input: {
    records: ReadonlyMap<string, PluginRuntimeRecord>;
    pluginId: string;
    request: PluginRouteRequest;
    context: PluginCallContext;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<PluginRouteResponse> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);
    const route = findManifestRouteOrThrow(
      record.manifest,
      input.request.method,
      input.request.path,
    );

    return this.runTimedPluginInvocation({
      record,
      context: input.context,
      type: 'route',
      metadata: {
        method: input.request.method,
        path: route.path,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 15000),
      timeoutMessage: `插件 ${input.pluginId} Route ${route.path} 执行超时`,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.invokeRoute({
          request: buildPluginRouteInvocationRequest({
            request: input.request,
            path: route.path,
          }),
          context: input.context,
        }),
      ),
    });
  }

  async invokePluginHook(input: {
    records: ReadonlyMap<string, PluginRuntimeRecord>;
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
    recordFailure?: boolean;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<JsonValue | null | undefined> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);

    return this.runTimedPluginInvocation({
      record,
      context: input.context,
      type: 'hook',
      metadata: {
        hookName: input.hookName,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 10000),
      timeoutMessage: `插件 ${record.manifest.id} Hook ${input.hookName} 执行超时`,
      skipPluginErrorHook: input.hookName === 'plugin:error',
      recordFailure: input.recordFailure !== false,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.invokeHook({
          hookName: input.hookName,
          context: input.context,
          payload: input.payload,
        }),
      ),
    });
  }

  private async runTimedPluginInvocation<T>(input: {
    record: PluginRuntimeRecord;
    context: PluginCallContext;
    type: RuntimeInvocationType;
    metadata: JsonObject;
    timeoutMs: number;
    timeoutMessage: string;
    skipPluginErrorHook?: boolean;
    recordFailure?: boolean;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
    execute: () => Promise<T>;
  }): Promise<T> {
    try {
      return await runWithRuntimeExecutionSlot({
        record: input.record,
        type: input.type,
        metadata: input.metadata,
        recordPluginEvent: async (pluginId, event) => {
          await this.pluginService.recordPluginEvent(pluginId, event);
        },
        execute: () => runPromiseWithTimeout(
          Promise.resolve().then(() => input.execute()),
          input.timeoutMs,
          input.timeoutMessage,
        ),
      });
    } catch (error) {
      if (isPluginOverloadedError(error)) {
        throw error;
      }

      if (input.recordFailure !== false) {
        const message = error instanceof Error ? error.message : String(error);
        await recordRuntimePluginFailureAndDispatch({
          pluginId: input.record.manifest.id,
          record: input.record,
          context: input.context,
          type: message.includes('超时')
            ? `${input.type}:timeout`
            : `${input.type}:error`,
          message,
          metadata: input.metadata,
          skipPluginErrorHook: input.skipPluginErrorHook,
          recordFailure: async (failure) => {
            await this.pluginService.recordPluginFailure(failure.pluginId, {
              type: failure.type,
              message: failure.message,
              metadata: failure.metadata,
              checked: failure.checked,
            });
          },
          dispatchPluginErrorHook: input.dispatchPluginErrorHook,
        });
      }
      throw error;
    }
  }
}
