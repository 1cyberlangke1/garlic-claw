import type {
  PluginCallContext,
  PluginErrorHookPayload,
  PluginHookName,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import {
  buildPluginErrorHookPayloadForRuntimeRecord,
  buildPluginRouteInvocationRequest,
  buildPluginToolHookPayload,
  findManifestRoute,
  findManifestTool,
  isRuntimeRecordEnabledForContext,
  normalizeRoutePath,
} from '@garlic-claw/shared';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type {
  PluginRuntimeRecord,
  ToolBeforeCallExecutionResult,
} from './plugin-runtime.types';
import { PluginService } from './plugin.service';

type RuntimeInvocationType = 'tool' | 'route' | 'hook';
type RuntimePluginErrorDispatcher = (input: {
  context: PluginCallContext;
  payload: PluginErrorHookPayload;
}) => Promise<void>;

function findManifestRouteOrThrow(
  manifest: PluginManifest,
  method: PluginRouteRequest['method'],
  path: string,
) {
  const route = findManifestRoute(manifest, method, path);
  if (route) {
    return route;
  }

  throw new NotFoundException(
    `插件 ${manifest.id} 未声明 Route: ${method} ${normalizeRoutePath(path)}`,
  );
}

function findManifestToolOrThrow(
  manifest: PluginManifest,
  toolName: string,
) {
  const tool = findManifestTool(manifest, toolName);
  if (!tool) {
    throw new NotFoundException(`Tool not found: ${manifest.id}:${toolName}`);
  }

  return tool;
}

function getRuntimeRecordOrThrow(
  records: ReadonlyMap<string, PluginRuntimeRecord>,
  pluginId: string,
): PluginRuntimeRecord {
  const record = records.get(pluginId);
  if (!record) {
    throw new NotFoundException(`Plugin not found: ${pluginId}`);
  }

  return record;
}

function assertRuntimeRecordEnabled(
  record: PluginRuntimeRecord,
  context: PluginCallContext,
): void {
  if (isRuntimeRecordEnabledForContext(record, context)) {
    return;
  }

  throw new ForbiddenException(`插件 ${record.manifest.id} 在当前作用域已禁用`);
}

function readRuntimeTimeoutMs(
  context: PluginCallContext,
  fallback: number,
): number {
  const raw = context.metadata?.timeoutMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }

  return raw;
}

async function runPromiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

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
    dispatchPluginErrorHook: RuntimePluginErrorDispatcher;
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
    dispatchPluginErrorHook: RuntimePluginErrorDispatcher;
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
    dispatchPluginErrorHook: RuntimePluginErrorDispatcher;
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
    dispatchPluginErrorHook: RuntimePluginErrorDispatcher;
    execute: () => Promise<T>;
  }): Promise<T> {
    try {
      return await this.runWithExecutionSlot(
        input.record,
        input.type,
        input.metadata,
        () => runPromiseWithTimeout(
          Promise.resolve().then(() => input.execute()),
          input.timeoutMs,
          input.timeoutMessage,
        ),
      );
    } catch (error) {
      if (
        error instanceof HttpException
        && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        throw error;
      }

      if (input.recordFailure !== false) {
        const message = error instanceof Error ? error.message : String(error);
        await this.recordFailureAndDispatch({
          record: input.record,
          context: input.context,
          type: message.includes('超时')
            ? `${input.type}:timeout`
            : `${input.type}:error`,
          message,
          metadata: input.metadata,
          skipPluginErrorHook: input.skipPluginErrorHook,
          dispatchPluginErrorHook: input.dispatchPluginErrorHook,
        });
      }
      throw error;
    }
  }

  private async runWithExecutionSlot<T>(
    record: PluginRuntimeRecord,
    type: RuntimeInvocationType,
    metadata: JsonObject,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (record.activeExecutions >= record.maxConcurrentExecutions) {
      const message = `插件 ${record.manifest.id} 当前执行并发已达上限，请稍后重试`;
      await this.pluginService.recordPluginEvent(record.manifest.id, {
        type: `${type}:overloaded`,
        level: 'warn',
        message,
        metadata: {
          ...metadata,
          activeExecutions: record.activeExecutions,
          maxConcurrentExecutions: record.maxConcurrentExecutions,
        },
      });
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    record.activeExecutions += 1;
    try {
      return await execute();
    } finally {
      record.activeExecutions = Math.max(0, record.activeExecutions - 1);
    }
  }

  private async recordFailureAndDispatch(input: {
    record: Pick<PluginRuntimeRecord, 'manifest' | 'runtimeKind' | 'deviceType'>;
    context: PluginCallContext;
    type: string;
    message: string;
    metadata?: JsonObject;
    checked?: boolean;
    skipPluginErrorHook?: boolean;
    dispatchPluginErrorHook: RuntimePluginErrorDispatcher;
  }): Promise<void> {
    await this.pluginService.recordPluginFailure(input.record.manifest.id, {
      type: input.type,
      message: input.message,
      metadata: input.metadata,
      checked: input.checked,
    });

    if (input.skipPluginErrorHook) {
      return;
    }

    await input.dispatchPluginErrorHook({
      context: input.context,
      payload: buildPluginErrorHookPayloadForRuntimeRecord({
        pluginId: input.record.manifest.id,
        context: input.context,
        type: input.type,
        message: input.message,
        metadata: input.metadata,
        record: input.record as {
          manifest: PluginManifest;
          runtimeKind: PluginRuntimeKind;
          deviceType: string;
        },
      }),
    });
  }
}
