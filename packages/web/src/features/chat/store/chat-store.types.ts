import type {
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessageRole,
  ChatMessageStatus,
  ConversationTodoItem,
  JsonValue,
  RuntimePermissionRequest,
} from '@garlic-claw/shared'

export interface ChatToolCallEntry {
  toolCallId?: string
  toolName: string
  input: JsonValue
  inputPreview: string
}

export interface ChatToolResultEntry {
  toolCallId?: string
  toolName: string
  output: JsonValue
  outputPreview: string
}

/**
 * 前端聊天消息。
 */
export interface ChatMessage {
  id?: string
  role: ChatMessageRole
  content: string
  parts?: ChatMessagePart[]
  toolCalls?: ChatToolCallEntry[]
  toolResults?: ChatToolResultEntry[]
  metadata?: ChatMessageMetadata
  provider?: string | null
  model?: string | null
  status: ChatMessageStatus
  error?: string | null
  createdAt?: string
  updatedAt?: string
}

/**
 * 聊天输入载荷。
 */
export interface ChatSendInput {
  content?: string
  parts?: ChatMessagePart[]
  provider?: string | null
  model?: string | null
  optimisticAssistantMetadata?: ChatMessageMetadata
}

export interface ChatPendingRuntimePermission extends RuntimePermissionRequest {
  resolving?: boolean
}

export type { ConversationTodoItem }
