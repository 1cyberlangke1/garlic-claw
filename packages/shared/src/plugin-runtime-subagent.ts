import type {
  PluginCallContext,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  SubagentAfterRunHookPayload,
} from './types/plugin';
import { toJsonValue } from './types/json';
import {
  clonePluginSubagentToolCalls,
  clonePluginSubagentToolResults,
  cloneSubagentRequest,
} from './plugin-runtime-clone.helpers';

type SubagentRunStreamPart = {
  type: string;
  [key: string]: unknown;
};

function isTextDeltaPart(part: SubagentRunStreamPart): part is SubagentRunStreamPart & {
  type: 'text-delta';
  text: string;
} {
  return part.type === 'text-delta' && typeof part.text === 'string';
}

function isToolCallPart(part: SubagentRunStreamPart): part is SubagentRunStreamPart & {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
} {
  return part.type === 'tool-call'
    && typeof part.toolCallId === 'string'
    && typeof part.toolName === 'string';
}

function isToolResultPart(part: SubagentRunStreamPart): part is SubagentRunStreamPart & {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
} {
  return part.type === 'tool-result'
    && typeof part.toolCallId === 'string'
    && typeof part.toolName === 'string';
}

export function buildSubagentRunResult(input: {
  providerId: string;
  modelId: string;
  text: string;
  finishReason?: string | null;
  toolCalls?: PluginSubagentToolCall[];
  toolResults?: PluginSubagentToolResult[];
}): PluginSubagentRunResult {
  return {
    providerId: input.providerId,
    modelId: input.modelId,
    text: input.text,
    message: {
      role: 'assistant',
      content: input.text,
    },
    ...(typeof input.finishReason !== 'undefined'
      ? { finishReason: input.finishReason }
      : {}),
    toolCalls: clonePluginSubagentToolCalls(input.toolCalls ?? []),
    toolResults: clonePluginSubagentToolResults(input.toolResults ?? []),
  };
}

export function buildResolvedSubagentRequest(input: {
  request: PluginSubagentRequest;
  providerId: string;
  modelId: string;
}): PluginSubagentRequest {
  return {
    ...cloneSubagentRequest(input.request),
    providerId: input.providerId,
    modelId: input.modelId,
  };
}

export function buildResolvedSubagentRunResult(input: {
  modelConfig: {
    providerId: string | number;
    id: string | number;
  };
  text: string;
  finishReason?: string | null;
  toolCalls?: PluginSubagentToolCall[];
  toolResults?: PluginSubagentToolResult[];
}): PluginSubagentRunResult {
  return buildSubagentRunResult({
    providerId: String(input.modelConfig.providerId),
    modelId: String(input.modelConfig.id),
    text: input.text,
    ...(typeof input.finishReason !== 'undefined'
      ? { finishReason: input.finishReason }
      : {}),
    toolCalls: input.toolCalls,
    toolResults: input.toolResults,
  });
}

export async function collectSubagentRunResult(input: {
  modelConfig: {
    providerId: string | number;
    id: string | number;
  };
  fullStream: AsyncIterable<unknown>;
  finishReason?: Promise<unknown> | unknown;
}): Promise<PluginSubagentRunResult> {
  let text = '';
  const toolCalls: PluginSubagentToolCall[] = [];
  const toolResults: PluginSubagentToolResult[] = [];

  for await (const rawPart of input.fullStream) {
    if (!rawPart || typeof rawPart !== 'object') {
      continue;
    }

    const part = rawPart as SubagentRunStreamPart;
    if (typeof part.type !== 'string') {
      continue;
    }

    if (isTextDeltaPart(part)) {
      text += part.text;
      continue;
    }
    if (isToolCallPart(part)) {
      toolCalls.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: toJsonValue(part.input),
      });
      continue;
    }
    if (isToolResultPart(part)) {
      toolResults.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: toJsonValue(part.output),
      });
    }
  }

  const finishReason = await input.finishReason;
  return buildResolvedSubagentRunResult({
    modelConfig: input.modelConfig,
    text,
    ...(finishReason !== undefined
      ? {
          finishReason: finishReason === null ? null : String(finishReason),
        }
      : {}),
    toolCalls,
    toolResults,
  });
}

export function buildSubagentToolSetRequest(input: {
  pluginId: string;
  context: PluginCallContext;
  providerId: string;
  modelId: string;
  toolNames?: string[];
}):
  | {
      context: PluginCallContext;
      allowedToolNames?: string[];
      excludedSources: Array<{
        kind: 'plugin';
        id: string;
      }>;
    }
  | undefined {
  if (!input.context.userId || !input.context.conversationId) {
    return undefined;
  }

  return {
    context: {
      source: 'subagent',
      userId: input.context.userId,
      conversationId: input.context.conversationId,
      activeProviderId: input.providerId,
      activeModelId: input.modelId,
      activePersonaId: input.context.activePersonaId,
    },
    allowedToolNames: input.toolNames,
    excludedSources: [
      {
        kind: 'plugin',
        id: input.pluginId,
      },
    ],
  };
}

export function buildResolvedSubagentAfterRunPayload(input: {
  context: PluginCallContext;
  pluginId: string;
  request: PluginSubagentRequest;
  modelConfig: {
    providerId: string | number;
    id: string | number;
  };
  result: PluginSubagentRunResult;
}): SubagentAfterRunHookPayload {
  return {
    context: {
      ...input.context,
    },
    pluginId: input.pluginId,
    request: buildResolvedSubagentRequest({
      request: input.request,
      providerId: String(input.modelConfig.providerId),
      modelId: String(input.modelConfig.id),
    }),
    result: input.result,
  };
}
