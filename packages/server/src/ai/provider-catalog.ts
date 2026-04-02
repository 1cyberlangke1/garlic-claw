import type {
  AiProviderCatalogItem,
} from '@garlic-claw/shared';

/**
 * provider 目录
 *
 * 输入:
 * - core 协议族与供应商 preset 的静态元数据
 *
 * 输出:
 * - 后端管理 API 和运行时注册共用的 provider 目录
 *
 * 预期行为:
 * - 目录显式区分 core 协议族和供应商 preset
 * - 协议接入只保留 openai / anthropic / gemini 三种协议族
 */
export type {
  ProviderProtocolDriver,
  AiProviderCatalogItem,
  AiProviderCatalogDriver,
} from '@garlic-claw/shared';
export { isProviderProtocolDriver } from '@garlic-claw/shared';

/**
 * core 协议族目录。
 */
export const CORE_PROVIDER_CATALOG: AiProviderCatalogItem[] = [
  {
    id: 'openai',
    kind: 'core',
    protocol: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    kind: 'core',
    protocol: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    kind: 'core',
    protocol: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
  },
];

/**
 * 供应商 preset 目录。
 */
export const PROVIDER_PRESET_CATALOG: AiProviderCatalogItem[] = [
  {
    id: 'groq',
    kind: 'preset',
    protocol: 'openai',
    name: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'xai',
    kind: 'preset',
    protocol: 'openai',
    name: 'xAI',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-1212',
  },
  {
    id: 'mistral',
    kind: 'preset',
    protocol: 'openai',
    name: 'Mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'cohere',
    kind: 'preset',
    protocol: 'openai',
    name: 'Cohere',
    defaultBaseUrl: 'https://api.cohere.ai/v1',
    defaultModel: 'command-r-plus',
  },
  {
    id: 'cerebras',
    kind: 'preset',
    protocol: 'openai',
    name: 'Cerebras',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-70b',
  },
  {
    id: 'deepinfra',
    kind: 'preset',
    protocol: 'openai',
    name: 'DeepInfra',
    defaultBaseUrl: 'https://api.deepinfra.com/v1/openai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
  },
  {
    id: 'togetherai',
    kind: 'preset',
    protocol: 'openai',
    name: 'Together AI',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  {
    id: 'perplexity',
    kind: 'preset',
    protocol: 'openai',
    name: 'Perplexity',
    defaultBaseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar-pro',
  },
  {
    id: 'gateway',
    kind: 'preset',
    protocol: 'openai',
    name: 'Vercel AI Gateway',
    defaultBaseUrl: 'https://gateway.ai.vercel.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'vercel',
    kind: 'preset',
    protocol: 'openai',
    name: 'Vercel AI',
    defaultBaseUrl: 'https://api.vercel.ai',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'openrouter',
    kind: 'preset',
    protocol: 'openai',
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
  },
];

/**
 * 对外暴露的 provider 目录。
 */
export const PROVIDER_CATALOG: AiProviderCatalogItem[] = [
  ...CORE_PROVIDER_CATALOG,
  ...PROVIDER_PRESET_CATALOG,
];
