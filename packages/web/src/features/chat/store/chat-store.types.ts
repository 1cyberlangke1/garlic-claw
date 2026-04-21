import type {
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessageRole,
  ChatMessageStatus,
  ConversationTodoItem,
  RuntimePermissionRequest,
} from '@garlic-claw/shared'

/**
 * 前端聊天消息。
 */
export interface ChatMessage {
  id?: string
  role: ChatMessageRole
  content: string
  parts?: ChatMessagePart[]
  toolCalls?: Array<{ toolName: string; input: string }>
  toolResults?: Array<{ toolName: string; output: string }>
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
