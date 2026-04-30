import type {
  ChatMessageMetadata,
  ChatMessagePart,
  JsonValue,
  Message,
  SendMessagePayload,
} from '@garlic-claw/shared'
import type { ChatMessage, ChatSendInput } from './chat-store.types'

/**
 * 反序列化已持久化的消息 parts。
 * @param value 服务端返回的 JSON 字符串
 * @returns 结构化 parts
 */
export function parseParts(value: string | null): ChatMessagePart[] | undefined {
  if (!value) {
    return undefined
  }

  return JSON.parse(value) as ChatMessagePart[]
}

/**
 * 将任意 JSON 载荷序列化为展示字符串。
 * @param value 工具输入或输出
 * @returns 适合 UI 展示的字符串
 */
export function stringifyPayload(value: JsonValue): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

/**
 * 反序列化工具调用列表。
 * @param value 服务端返回的 JSON 字符串
 * @returns UI 可展示的工具调用
 */
export function parseToolCalls(value: string | null): ChatMessage['toolCalls'] {
  if (!value) {
    return undefined
  }

  return (JSON.parse(value) as Array<{ toolCallId?: string; toolName: string; input: JsonValue }>).map((item) => ({
    ...(typeof item.toolCallId === 'string' ? { toolCallId: item.toolCallId } : {}),
    toolName: item.toolName,
    input: item.input,
    inputPreview: stringifyPayload(item.input),
  }))
}

/**
 * 反序列化工具结果列表。
 * @param value 服务端返回的 JSON 字符串
 * @returns UI 可展示的工具结果
 */
export function parseToolResults(value: string | null): ChatMessage['toolResults'] {
  if (!value) {
    return undefined
  }

  return (JSON.parse(value) as Array<{ toolCallId?: string; toolName: string; output: JsonValue }>).map((item) => ({
    ...(typeof item.toolCallId === 'string' ? { toolCallId: item.toolCallId } : {}),
    toolName: item.toolName,
    output: item.output,
    outputPreview: stringifyPayload(item.output),
  }))
}

/**
 * 反序列化消息 metadata。
 * @param value 服务端返回的 JSON 字符串
 * @returns UI 可消费的消息 metadata
 */
export function parseMessageMetadata(
  value: string | null | undefined,
): ChatMessageMetadata | undefined {
  if (!value) {
    return undefined
  }

  return JSON.parse(value) as ChatMessageMetadata
}

/**
 * 将数据库消息映射为前端消息。
 * @param message 服务端消息
 * @returns 前端可消费的消息
 */
export function dbMessageToChat(message: Message): ChatMessage {
  return {
    id: message.id,
    role: message.role as ChatMessage['role'],
    content: message.content || '',
    parts: parseParts(message.partsJson),
    toolCalls: parseToolCalls(message.toolCalls),
    toolResults: parseToolResults(message.toolResults),
    metadata: parseMessageMetadata(message.metadataJson),
    provider: message.provider,
    model: message.model,
    status: message.status,
    error: message.error,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

/**
 * 规范化聊天输入。
 * @param input 原始输入
 * @returns 可直接发送给后端的载荷
 */
export function normalizeSendInput(input: ChatSendInput): SendMessagePayload {
  const trimmedContent = input.content?.trim()
  const normalizedParts = input.parts?.filter((part) =>
    part.type === 'text' ? part.text.trim().length > 0 : Boolean(part.image),
  )

  if (normalizedParts && normalizedParts.length > 0) {
    return {
      content: trimmedContent,
      parts: normalizedParts,
      provider: input.provider ?? undefined,
      model: input.model ?? undefined,
    }
  }

  return {
    content: trimmedContent,
    provider: input.provider ?? undefined,
    model: input.model ?? undefined,
  }
}

/**
 * 找出当前对话中仍在生成的回复消息。
 * @param messages 对话消息列表
 * @returns 活跃消息 ID；不存在时返回 null
 */
export function findActiveAssistantMessageId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (
      isActiveResponseMessage(message) &&
      (message.status === 'pending' || message.status === 'streaming')
    ) {
      return message.id ?? null
    }
  }

  return null
}

function isActiveResponseMessage(message: ChatMessage): boolean {
  if (message.role === 'assistant') {
    return true
  }

  return message.role === 'display' && readDisplayMessageVariant(message) === 'result'
}

function readDisplayMessageVariant(message: ChatMessage): 'command' | 'result' | null {
  const annotation = message.metadata?.annotations?.find(
    (entry) =>
      entry.type === 'display-message' &&
      entry.owner === 'conversation.display-message' &&
      entry.version === '1',
  )
  const variant =
    annotation?.data &&
    typeof annotation.data === 'object' &&
    !Array.isArray(annotation.data) &&
    'variant' in annotation.data
      ? annotation.data.variant
      : null

  return variant === 'command' || variant === 'result' ? variant : null
}
