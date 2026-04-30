import type {
  JsonValue,
  PluginConfigSchema,
  PluginSubagentCloseParams,
  PluginSubagentInterruptParams,
  PluginSubagentSendInputParams,
  PluginSubagentSpawnParams,
  PluginSubagentSummary,
  PluginSubagentWaitParams,
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
          description: "单个主会话最多允许创建多少个子代理会话。达到上限后，新建会话会直接报错。",
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
    name: "spawn_subagent",
    description: "创建一个新的子代理会话，并立刻在后台开始执行。",
    parameters: {
      name: {
        type: "string",
        description: "可选。为这个子代理起一个短名称，用于标签页和会话栏展示",
      },
      prompt: {
        type: "string",
        description: "交给子代理的完整任务描述",
        required: true,
      },
      description: {
        type: "string",
        description: "简短描述，用于在标签页中识别",
      },
      providerId: {
        type: "string",
        description: "可选。指定子代理使用的 provider ID",
      },
      modelId: {
        type: "string",
        description: "可选。指定子代理使用的 model ID",
      },
      subagentType: {
        type: "string",
        description: "指定子代理类型 ID",
      },
      writeBack: {
        type: "boolean",
        description: "完成后是否回写到当前会话",
      },
    },
  },
  {
    name: "wait_subagent",
    description: "等待一个子代理状态发生变化，通常用于等待执行完成。",
    parameters: {
      conversationId: {
        type: "string",
        description: "子代理会话 ID",
        required: true,
      },
      timeoutMs: {
        type: "number",
        description: "可选。最多等待多少毫秒",
      },
    },
  },
  {
    name: "send_input_subagent",
    description: "向已有子代理会话继续发送输入，发起下一轮执行。",
    parameters: {
      conversationId: {
        type: "string",
        description: "子代理会话 ID",
        required: true,
      },
      name: {
        type: "string",
        description: "可选。更新这个子代理的展示名称",
      },
      prompt: {
        type: "string",
        description: "继续发给子代理的完整输入",
        required: true,
      },
      description: {
        type: "string",
        description: "可选。更新该子代理的简短描述",
      },
      providerId: {
        type: "string",
        description: "可选。指定本轮继续输入使用的 provider ID",
      },
      modelId: {
        type: "string",
        description: "可选。指定本轮继续输入使用的 model ID",
      },
    },
  },
  {
    name: "interrupt_subagent",
    description: "中断正在运行的子代理。",
    parameters: {
      conversationId: {
        type: "string",
        description: "子代理会话 ID",
        required: true,
      },
    },
  },
  {
    name: "close_subagent",
    description: "关闭一个子代理会话，关闭后不再接受新的输入。",
    parameters: {
      conversationId: {
        type: "string",
        description: "子代理会话 ID",
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

export function buildSubagentSpawnParams(input: { config: PluginSubagentConfig; prompt: string; shouldWriteBack: boolean; conversationId?: string | null; name?: string | null; description?: string | null; subagentType?: string | null; providerId?: string | null; modelId?: string | null }): PluginSubagentSpawnParams & { writeBack?: { target: { id: string; type: "conversation" } } } {
  return {
    ...buildSubagentBaseParams(input),
    ...(input.shouldWriteBack && input.conversationId ? { writeBack: { target: { id: input.conversationId, type: "conversation" } } } : {}),
  };
}

export function buildSubagentWaitParams(input: { conversationId: string; timeoutMs?: number | null }): PluginSubagentWaitParams {
  return {
    conversationId: input.conversationId,
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
  };
}

export function buildSubagentSendInputParams(input: { config: PluginSubagentConfig; conversationId: string; prompt: string; name?: string | null; description?: string | null; providerId?: string | null; modelId?: string | null }): PluginSubagentSendInputParams {
  return {
    conversationId: input.conversationId,
    ...(sanitizeOptionalText(input.name ?? undefined) ? { name: sanitizeOptionalText(input.name ?? undefined) } : {}),
    ...(sanitizeOptionalText(input.description ?? undefined) ? { description: sanitizeOptionalText(input.description ?? undefined) } : {}),
    ...(sanitizeOptionalText(input.providerId ?? undefined)
      ? { providerId: sanitizeOptionalText(input.providerId ?? undefined) }
      : sanitizeOptionalText(input.config.targetProviderId)
        ? { providerId: sanitizeOptionalText(input.config.targetProviderId) }
        : {}),
    ...(sanitizeOptionalText(input.modelId ?? undefined)
      ? { modelId: sanitizeOptionalText(input.modelId ?? undefined) }
      : sanitizeOptionalText(input.config.targetModelId)
        ? { modelId: sanitizeOptionalText(input.config.targetModelId) }
        : {}),
    messages: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
    ...(input.config.allowedToolNames?.length ? { toolNames: input.config.allowedToolNames } : {}),
  };
}

export function buildSubagentInterruptParams(input: { conversationId: string }): PluginSubagentInterruptParams {
  return { conversationId: input.conversationId };
}

export function buildSubagentCloseParams(input: { conversationId: string }): PluginSubagentCloseParams {
  return { conversationId: input.conversationId };
}

export function createSubagentSummaryResult(result: PluginSubagentSummary): JsonValue {
  return toHostJsonValue(result);
}

function buildSubagentBaseParams(input: { config: PluginSubagentConfig; prompt: string; name?: string | null; description?: string | null; subagentType?: string | null; providerId?: string | null; modelId?: string | null }): PluginSubagentSpawnParams {
  const toolNames = input.config.allowedToolNames?.length ? input.config.allowedToolNames : null;
  return {
    ...(sanitizeOptionalText(input.name ?? undefined) ? { name: sanitizeOptionalText(input.name ?? undefined) } : {}),
    ...(sanitizeOptionalText(input.description ?? undefined) ? { description: sanitizeOptionalText(input.description ?? undefined) } : {}),
    ...(typeof input.config.maxConversationSubagents === "number" ? { maxConversationSubagents: input.config.maxConversationSubagents } : {}),
    ...(sanitizeOptionalText(input.subagentType ?? undefined)
      ? { subagentType: sanitizeOptionalText(input.subagentType ?? undefined) }
      : sanitizeOptionalText(input.config.targetSubagentType)
        ? { subagentType: sanitizeOptionalText(input.config.targetSubagentType) }
        : {}),
    ...(sanitizeOptionalText(input.providerId ?? undefined)
      ? { providerId: sanitizeOptionalText(input.providerId ?? undefined) }
      : sanitizeOptionalText(input.config.targetProviderId)
        ? { providerId: sanitizeOptionalText(input.config.targetProviderId) }
        : {}),
    ...(sanitizeOptionalText(input.modelId ?? undefined)
      ? { modelId: sanitizeOptionalText(input.modelId ?? undefined) }
      : sanitizeOptionalText(input.config.targetModelId)
        ? { modelId: sanitizeOptionalText(input.config.targetModelId) }
        : {}),
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
