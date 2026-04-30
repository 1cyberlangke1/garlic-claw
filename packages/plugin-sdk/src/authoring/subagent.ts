import type {
  JsonValue,
  PluginConfigSchema,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  PluginSubagentStartParams,
  PluginSubagentSummary,
} from "@garlic-claw/shared";
import { toHostJsonValue } from "../host";
import { pickOptionalStringFields, readJsonObjectValue, sanitizeOptionalText } from "./common-helpers";

export interface PluginSubagentConfig {
  maxConversationSubagents?: number;
  targetSubagentType?: string;
  targetProviderId?: string;
  targetModelId?: string;
  allowedToolNames?: string[];
}

export const SUBAGENT_CONFIG_SCHEMA = {
  type: "object",
  items: {
    llm: {
      type: "object",
      description: "模型设置",
      items: {
        targetSubagentType: {
          type: "string",
          description: "子代理默认使用的类型 ID",
          specialType: "selectSubagentType",
          defaultValue: "general",
        },
        targetProviderId: {
          type: "string",
          description: "可选。覆盖子代理类型默认 provider ID",
          specialType: "selectProvider",
        },
        targetModelId: {
          type: "string",
          description: "可选。覆盖子代理类型默认 model ID",
        },
      },
    },
    session: {
      type: "object",
      description: "会话窗口限制",
      items: {
        maxConversationSubagents: {
          type: "int",
          description: "单个主会话最多允许创建多少个 subagent 会话。达到上限后，新建会话会直接报错；继续已有 session 不受影响。",
          defaultValue: 6,
        },
      },
    },
    tools: {
      type: "object",
      description: "工具限制",
      hint: "留空表示允许子代理使用当前上下文中可见的全部工具。",
      collapsed: true,
      items: {
        allowedToolNames: {
          type: "list",
          description: "允许子代理使用的工具名列表",
          items: {
            type: "string",
          },
          editorMode: true,
        },
      },
    },
  },
} satisfies PluginConfigSchema;

export const SUBAGENT_TOOL_DEFINITIONS = [
  {
    name: "subagent",
    description: "启动一个子代理处理复杂任务。传入 sessionId 可恢复已有子代理的上下文继续执行。结果用 <subagent_result> 包裹。",
    parameters: {
      prompt: {
        type: "string",
        description: "交给子代理的完整任务描述",
        required: true,
      },
      description: {
        type: "string",
        description: "简短描述，用于在标签页中识别",
      },
      subagentType: {
        type: "string",
        description: "指定子代理类型 ID",
      },
      sessionId: {
        type: "string",
        description: "传入已有的子代理 session ID 可恢复上下文继续执行",
      },
    },
  },
  {
    name: "subagent_background",
    description: "后台启动子代理，完成后自动回写结果到当前会话。传入 sessionId 可恢复已有子代理。",
    parameters: {
      prompt: {
        type: "string",
        description: "交给后台子代理的完整任务描述",
        required: true,
      },
      description: {
        type: "string",
        description: "简短描述，用于在标签页中识别",
      },
      subagentType: {
        type: "string",
        description: "指定子代理类型 ID",
      },
      sessionId: {
        type: "string",
        description: "传入已有的子代理 session ID 可恢复上下文继续执行",
      },
      writeBack: {
        type: "boolean",
        description: "完成后是否回写到当前会话",
      },
    },
  },
  {
    name: "cancel_subagent",
    description: "取消指定的子代理会话。传入 sessionId，会停止正在运行或排队的子代理。",
    parameters: {
      sessionId: {
        type: "string",
        description: "要取消的子代理 session ID",
        required: true,
      },
    },
  },
] as const;

export function readSubagentConfig(value: unknown): PluginSubagentConfig {
  const object = readJsonObjectValue(value);
  const llm = readJsonObjectValue(object?.llm);
  const session = readJsonObjectValue(object?.session);
  const tools = readJsonObjectValue(object?.tools);
  const allowedToolNames = readOptionalToolNames(tools?.allowedToolNames);
  return {
    ...pickOptionalStringFields(llm, ["targetSubagentType", "targetProviderId", "targetModelId"] as const),
    ...(typeof session?.maxConversationSubagents === "number" && Number.isInteger(session.maxConversationSubagents) && session.maxConversationSubagents > 0
      ? { maxConversationSubagents: session.maxConversationSubagents }
      : {}),
    ...(allowedToolNames ? { allowedToolNames } : {}),
  };
}

export function buildSubagentRunParams(input: { config: PluginSubagentConfig; prompt: string; description?: string | null; subagentType?: string | null; sessionId?: string | null }): PluginSubagentRunParams {
  return buildSubagentBaseParams(input);
}

export function buildSubagentStartParams(input: { config: PluginSubagentConfig; prompt: string; shouldWriteBack: boolean; conversationId?: string | null; description?: string | null; subagentType?: string | null; sessionId?: string | null }): PluginSubagentStartParams {
  const base = buildSubagentBaseParams(input);
  return { ...base, ...(input.shouldWriteBack && input.conversationId ? { writeBack: { target: { type: "conversation", id: input.conversationId } } } : {}) };
}

export function createSubagentRunSummary(result: PluginSubagentRunResult): JsonValue {
  return toHostJsonValue({
    sessionId: result.sessionId,
    sessionMessageCount: result.sessionMessageCount,
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    ...(result.finishReason !== undefined ? { finishReason: result.finishReason } : {}),
  });
}

export function createSubagentSummaryResult(result: PluginSubagentSummary): JsonValue {
  return toHostJsonValue(result);
}

function buildSubagentBaseParams(input: { config: PluginSubagentConfig; prompt: string; description?: string | null; subagentType?: string | null; sessionId?: string | null }): PluginSubagentRunParams {
  const toolNames = input.config.allowedToolNames?.length ? input.config.allowedToolNames : null;
  return {
    ...(sanitizeOptionalText(input.sessionId ?? undefined) ? { sessionId: sanitizeOptionalText(input.sessionId ?? undefined) } : {}),
    ...(sanitizeOptionalText(input.description ?? undefined) ? { description: sanitizeOptionalText(input.description ?? undefined) } : {}),
    ...(typeof input.config.maxConversationSubagents === "number" ? { maxConversationSubagents: input.config.maxConversationSubagents } : {}),
    ...(sanitizeOptionalText(input.subagentType ?? undefined) ? { subagentType: sanitizeOptionalText(input.subagentType ?? undefined) } : sanitizeOptionalText(input.config.targetSubagentType) ? { subagentType: sanitizeOptionalText(input.config.targetSubagentType) } : {}),
    ...(sanitizeOptionalText(input.config.targetProviderId) ? { providerId: sanitizeOptionalText(input.config.targetProviderId) } : {}),
    ...(sanitizeOptionalText(input.config.targetModelId) ? { modelId: sanitizeOptionalText(input.config.targetModelId) } : {}),
    messages: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
    ...(toolNames ? { toolNames } : {}),
  };
}

function readOptionalToolNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}
