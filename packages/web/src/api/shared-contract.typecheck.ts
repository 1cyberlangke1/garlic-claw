import type {
  ActionConfig,
  AiDefaultProviderSelection,
  AiModelCapabilities,
  AiModelConfig,
  AiProviderCatalogItem,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  AutomationInfo,
  ChatMessagePart,
  ChatMessageStatus,
  Conversation,
  ConversationDetail,
  ConversationHostServices,
  ConversationTodoItem,
  DiscoveredAiModel,
  Message,
  PluginInfo,
  PluginStorageEntry,
  RetryMessagePayload,
  SendMessagePayload,
  SSEEvent,
  TriggerConfig,
  UpdateMessagePayload,
  VisionFallbackConfig,
} from '@garlic-claw/shared'

/**
 * 共享契约编译期检查。
 *
 * 输入:
 * - `@garlic-claw/shared` 暴露的公共类型
 *
 * 输出:
 * - 一组最小示例值，强制 `web` 依赖共享类型而不是本地重复声明
 *
 * 预期行为:
 * - shared 未导出这些契约时，`vue-tsc` 必须先报错
 * - 迁移完成后，该文件持续充当公共导出回归保护
 */

const chatPart: ChatMessagePart = { type: 'text', text: 'hello' }
const chatStatus: ChatMessageStatus = 'completed'

const modelCapabilities: AiModelCapabilities = {
  reasoning: true,
  toolCall: true,
  input: { text: true, image: true },
  output: { text: true, image: false },
}

const providerSummary: AiProviderSummary = {
  id: 'openai',
  name: 'OpenAI',
  driver: 'openai',
  defaultModel: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  modelCount: 1,
  available: true,
}

const providerConfig: AiProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  driver: 'openai',
  defaultModel: 'gpt-4o-mini',
  models: ['gpt-4o-mini'],
}

const modelConfig: AiModelConfig = {
  id: 'gpt-4o-mini',
  providerId: 'openai',
  name: 'GPT-4o mini',
  capabilities: modelCapabilities,
  contextLength: 128 * 1024,
  api: {
    id: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1',
    npm: '@ai-sdk/openai',
  },
  status: 'active',
}

const visionConfig: VisionFallbackConfig = {
  enabled: true,
  providerId: 'gemini',
  modelId: 'gemini-1.5-pro',
  prompt: '请描述图片',
  maxDescriptionLength: 0,
}

const discoveredModel: DiscoveredAiModel = {
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
}

const connectionResult: AiProviderConnectionTestResult = {
  ok: true,
  providerId: 'openai',
  modelId: 'gpt-4o-mini',
  text: 'ok',
}

const defaultSelection: AiDefaultProviderSelection = {
  providerId: 'openai',
  modelId: 'gpt-4o-mini',
  source: 'default',
}

const pluginInfo: PluginInfo = {
  id: 'plugin-1',
  name: 'plugin-pc',
  status: 'online',
  connected: true,
  defaultEnabled: true,
  manifest: {
    id: 'plugin-pc',
    name: 'plugin-pc',
    version: '1.0.0',
    runtime: 'remote',
    remote: {
      remoteEnvironment: 'api',
      auth: { mode: 'required' },
      capabilityProfile: 'query',
    },
    permissions: [],
    tools: [
      {
        name: 'echo',
        description: 'echo text',
        parameters: {},
      },
    ],
  },
  remote: {
    descriptor: {
      remoteEnvironment: 'api',
      auth: { mode: 'required' },
      capabilityProfile: 'query',
    },
    access: {
      serverUrl: 'ws://127.0.0.1:23331',
      accessKey: 'plugin-key',
    },
    metadataCache: {
      status: 'cached',
      lastSyncedAt: '2026-03-26T00:00:00.000Z',
      manifestHash: 'manifest-hash',
    },
  },
  supportedActions: ['health-check', 'reload'],
  eventLog: {
    maxFileSizeMb: 1,
  },
  lastSeenAt: '2026-03-26T00:00:00.000Z',
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
}

const pluginStorageEntry: PluginStorageEntry = {
  key: 'cursor.offset',
  value: 3,
}

const catalogItem: AiProviderCatalogItem = {
  id: 'openai',
  kind: 'core',
  protocol: 'openai',
  name: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
}

const message: Message = {
  id: 'message-1',
  role: 'assistant',
  content: 'hello',
  partsJson: null,
  toolCalls: null,
  toolResults: null,
  provider: 'openai',
  model: 'gpt-4o-mini',
  status: chatStatus,
  error: null,
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
}

const conversation: Conversation = {
  id: 'conversation-1',
  title: 'test',
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
  _count: { messages: 1 },
}

const conversationDetail: ConversationDetail = {
  ...conversation,
  messages: [message],
}

const conversationHostServices: ConversationHostServices = {
  sessionEnabled: true,
  llmEnabled: true,
  ttsEnabled: true,
}

const sendPayload: SendMessagePayload = {
  content: 'hello',
  parts: [chatPart],
  provider: 'openai',
  model: 'gpt-4o-mini',
}

const updatePayload: UpdateMessagePayload = {
  content: 'updated',
  parts: [chatPart],
}

const retryPayload: RetryMessagePayload = {
  provider: 'openai',
  model: 'gpt-4o-mini',
}

const sseEvent: SSEEvent = {
  type: 'message-start',
  userMessage: message,
  assistantMessage: message,
}

const patchedSseEvent: SSEEvent = {
  type: 'message-patch',
  messageId: 'message-1',
  content: 'patched',
}

const todoItems: ConversationTodoItem[] = [{
  content: '同步 todo 面板',
  priority: 'high',
  status: 'in_progress',
}]

const todoUpdatedEvent: SSEEvent = {
  type: 'todo-updated',
  conversationId: 'conversation-1',
  todos: todoItems,
}

const trigger: TriggerConfig = {
  type: 'manual',
}

const action: ActionConfig = {
  type: 'ai_message',
  message: 'hello',
  target: {
    type: 'conversation',
    id: 'conversation-1',
  },
}

const automation: AutomationInfo = {
  id: 'automation-1',
  name: 'test',
  trigger,
  actions: [action],
  enabled: true,
  lastRunAt: null,
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
  logs: [{ id: 'log-1', status: 'success', result: null, createdAt: '2026-03-26T00:00:00.000Z' }],
}

void [
  providerSummary,
  providerConfig,
  modelConfig,
  visionConfig,
  discoveredModel,
  connectionResult,
  defaultSelection,
  catalogItem,
  pluginInfo,
  pluginStorageEntry,
  conversationDetail,
  conversationHostServices,
  sendPayload,
  updatePayload,
  retryPayload,
  sseEvent,
  patchedSseEvent,
  todoUpdatedEvent,
  automation,
]

export {}
