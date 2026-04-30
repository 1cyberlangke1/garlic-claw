import {
  asChatBeforeModelPayload,
  clipContextText,
  createMemoryRecallToolResult,
  createMemorySaveToolResult,
  createPassHookResult,
  MEMORY_CONTEXT_CONFIG_SCHEMA,
  MEMORY_CONTEXT_DEFAULT_LIMIT,
  MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
  readLatestUserTextFromMessages,
  readMemorySaveResultId,
  readMemorySearchResults,
  readOptionalStringParam,
  readPromptBlockConfig,
  readRequiredStringParam,
  resolvePromptBlockConfig,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';

export const BUILTIN_MEMORY_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: {
    config: MEMORY_CONTEXT_CONFIG_SCHEMA,
    description: '提供长期记忆写入、检索，并在模型调用前自动注入相关记忆摘要。',
    hooks: [
      {
        description: '在模型调用前补入用户长期记忆摘要',
        name: 'chat:before-model',
      },
    ],
    id: 'builtin.memory',
    name: '记忆',
    permissions: ['config:read', 'memory:read', 'memory:write'],
    runtime: 'local',
    tools: [
      {
        description: '将重要信息保存到长期记忆中',
        name: 'save_memory',
        parameters: {
          category: {
            description: '记忆类别',
            type: 'string',
          },
          content: {
            description: '要记住的信息',
            required: true,
            type: 'string',
          },
          keywords: {
            description: '逗号分隔的关键词',
            type: 'string',
          },
        },
      },
      {
        description: '搜索用户长期记忆',
        name: 'search_memory',
        parameters: {
          query: {
            description: '搜索查询',
            required: true,
            type: 'string',
          },
        },
      },
    ],
    version: '1.0.0',
  },
  hooks: {
    'chat:before-model': async (payload, context) => {
      const hookPayload = asChatBeforeModelPayload(payload);
      const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
      if (!latestUserText) {
        return createPassHookResult();
      }
      const runtimeConfig = resolvePromptBlockConfig(
        readPromptBlockConfig(await context.host.getConfig()),
        {
          limit: MEMORY_CONTEXT_DEFAULT_LIMIT,
          promptPrefix: MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
        },
      );
      const memories = readMemorySearchResults(
        await context.host.searchMemories(latestUserText, runtimeConfig.limit),
      );
      const lines = memories
        .map((memory) => formatMemoryLine(memory))
        .filter((line) => line.length > 0);
      if (lines.length === 0) {
        return createPassHookResult();
      }
      const promptBlock = `${runtimeConfig.promptPrefix}：\n${lines.join('\n')}`;
      const messages = insertMemoryContextMessage(hookPayload.request.messages, promptBlock);
      return messages ? { action: 'mutate', messages } : createPassHookResult();
    },
  },
  tools: {
    save_memory: async (params, context) => (
      createMemorySaveToolResult(
        readMemorySaveResultId(
          await context.host.saveMemory({
            ...(readOptionalStringParam(params, 'category') ? { category: readOptionalStringParam(params, 'category') ?? undefined } : {}),
            content: readRequiredStringParam(params, 'content'),
            ...(readOptionalStringParam(params, 'keywords') ? { keywords: readOptionalStringParam(params, 'keywords') ?? undefined } : {}),
          }),
        ),
      )
    ),
    search_memory: async (params, context) => (
      createMemoryRecallToolResult(
        readMemorySearchResults(
          await context.host.searchMemories(
            readRequiredStringParam(params, 'query'),
          ),
        ),
      )
    ),
  },
};

function insertMemoryContextMessage(
  messages: Array<{
    content: string | Array<{ text?: string; type: string }>;
    role: 'assistant' | 'system' | 'tool' | 'user';
  }>,
  promptBlock: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') {
      continue;
    }
    return [
      ...messages.slice(0, index),
      { content: promptBlock, role: 'assistant' as const },
      messages[index],
      ...messages.slice(index + 1),
    ];
  }
  return null;
}

function formatMemoryLine(memory: { category?: string; content?: string }): string {
  const content = clipContextText(memory.content ?? '');
  return content ? `- [${memory.category ?? 'general'}] ${content}` : '';
}
