import { tool, type Tool } from 'ai';
import type { PluginCallContext } from '@garlic-claw/shared';
import { z } from 'zod';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import type {
  ResolvedToolRecord,
  ToolRecord,
} from './tool.types';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export function buildAiToolSetFromResolvedTools(input: {
  resolvedTools: ResolvedToolRecord[];
  context: PluginCallContext;
  allowedToolNames?: string[];
  pluginRuntime: Pick<PluginRuntimeService, 'runHook'>;
}): Record<string, Tool> | undefined {
  const filteredTools = input.allowedToolNames
    ? input.resolvedTools.filter((entry) =>
      input.allowedToolNames?.includes(entry.record.callName))
    : input.resolvedTools;
  if (filteredTools.length === 0) {
    return undefined;
  }

  const toolSet: Record<string, Tool> = {};
  for (const entry of filteredTools) {
    toolSet[entry.record.callName] = tool({
      description: entry.record.description,
      inputSchema: paramSchemaToZod(entry.record.parameters),
      execute: async (args: JsonObject) => {
        try {
          return await executeResolvedTool({
            entry,
            args,
            context: input.context,
            pluginRuntime: input.pluginRuntime,
          });
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  return toolSet;
}

async function executeResolvedTool(input: {
  entry: ResolvedToolRecord;
  args: JsonObject;
  context: PluginCallContext;
  pluginRuntime: Pick<PluginRuntimeService, 'runHook'>;
}): Promise<JsonValue> {
  const beforeCallResult = await input.pluginRuntime.runHook({
    hookName: 'tool:before-call',
    context: input.context,
    payload: buildBeforeCallPayload(input.entry, input.args, input.context),
  });
  if (beforeCallResult.action === 'short-circuit') {
    return beforeCallResult.output;
  }

  const toolParams = beforeCallResult.payload.params;
  const output = await Promise.resolve(input.entry.provider.executeTool({
    tool: input.entry.raw,
    params: toolParams,
    context: input.context,
    skipLifecycleHooks: input.entry.record.source.kind === 'plugin',
  }));
  const afterCallPayload = await input.pluginRuntime.runHook({
    hookName: 'tool:after-call',
    context: input.context,
    payload: buildAfterCallPayload(input.entry, toolParams, output, input.context),
  });

  return afterCallPayload.output;
}

function buildBeforeCallPayload(
  entry: ResolvedToolRecord,
  params: JsonObject,
  context: PluginCallContext,
) {
  return {
    context: {
      ...context,
    },
    source: {
      kind: entry.record.source.kind,
      id: entry.record.source.id,
      label: entry.record.source.label,
      ...(entry.record.pluginId ? { pluginId: entry.record.pluginId } : {}),
      ...(entry.record.runtimeKind ? { runtimeKind: entry.record.runtimeKind } : {}),
    },
    ...(entry.record.pluginId ? { pluginId: entry.record.pluginId } : {}),
    ...(entry.record.runtimeKind ? { runtimeKind: entry.record.runtimeKind } : {}),
    tool: {
      toolId: entry.record.toolId,
      callName: entry.record.callName,
      name: entry.record.toolName,
      description: entry.record.description,
      parameters: {
        ...entry.record.parameters,
      },
    },
    params: {
      ...params,
    },
  };
}

function buildAfterCallPayload(
  entry: ResolvedToolRecord,
  params: JsonObject,
  output: JsonValue,
  context: PluginCallContext,
) {
  return {
    ...buildBeforeCallPayload(entry, params, context),
    output,
  };
}

function paramSchemaToZod(params: ToolRecord['parameters']) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, schema] of Object.entries(params)) {
    let zType: z.ZodTypeAny;
    switch (schema.type) {
      case 'number':
        zType = z.number();
        break;
      case 'boolean':
        zType = z.boolean();
        break;
      case 'array':
        zType = z.array(jsonValueSchema);
        break;
      case 'object':
        zType = z.record(z.string(), jsonValueSchema);
        break;
      default:
        zType = z.string();
    }
    if (schema.description) {
      zType = zType.describe(schema.description);
    }
    if (!schema.required) {
      zType = zType.optional();
    }
    shape[key] = zType;
  }

  return z.object(shape);
}
