import {
  asChatBeforeModelPayload,
  clipContextText,
  createPassHookResult,
  MEMORY_CONTEXT_CONFIG_SCHEMA,
  MEMORY_CONTEXT_DEFAULT_LIMIT,
  MEMORY_CONTEXT_DEFAULT_PROMPT_PREFIX,
  readLatestUserTextFromMessages,
  readMemorySearchResults,
  readPromptBlockConfig,
  resolvePromptBlockConfig,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

export const BUILTIN_MEMORY_CONTEXT_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: {
    config: MEMORY_CONTEXT_CONFIG_SCHEMA,
    description: '在模型调用前检索并注入用户长期记忆摘要的本地插件。',
    hooks: [
      {
        description: '在模型调用前补入用户长期记忆摘要',
        name: 'chat:before-model',
      },
    ],
    id: 'builtin.memory-context',
    name: '记忆上下文',
    permissions: ['config:read', 'memory:read'],
    runtime: 'local',
    tools: [],
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
