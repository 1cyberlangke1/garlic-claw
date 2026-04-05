import type { Ref } from 'vue'
import type { ChatSendInput } from '@/features/chat/store/chat-store.types'
import {
  loadConversationMessages,
  retryConversationMessage,
  sendConversationMessage,
} from '@/features/chat/modules/chat-conversation.data'
import { startChatRecoveryPolling, stopChatRecoveryPolling } from '@/features/chat/modules/chat-recovery.polling'
import { findActiveAssistantMessageId, normalizeSendInput } from '@/features/chat/store/chat-store.helpers'
import {
  applyRequestError,
  applySseEvent,
  buildOptimisticAssistantMessage,
  buildOptimisticUserMessage,
  createTemporaryMessageId,
  replaceMessage,
} from '@/features/chat/store/chat-store.runtime'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'

export interface ChatStreamState {
  currentConversationId: Ref<string | null>
  messages: Ref<ChatMessage[]>
  selectedProvider: Ref<string | null>
  selectedModel: Ref<string | null>
  streamController: Ref<AbortController | null>
  recoveryTimer: Ref<number | null>
  currentStreamingMessageId: Ref<string | null>
  streaming: Ref<boolean>
}

export function syncChatStreamingState(state: ChatStreamState) {
  state.currentStreamingMessageId.value = findActiveAssistantMessageId(state.messages.value)
  state.streaming.value = Boolean(state.currentStreamingMessageId.value)
}

export function abortChatStream(state: ChatStreamState) {
  state.streamController.value?.abort()
  state.streamController.value = null
}

export function stopChatRecovery(state: ChatStreamState) {
  stopChatRecoveryPolling(state.recoveryTimer)
}

export function scheduleChatRecovery(state: ChatStreamState) {
  startChatRecoveryPolling({
    recoveryTimer: state.recoveryTimer,
    streamController: state.streamController,
    currentConversationId: state.currentConversationId,
    isStreaming: () => state.streaming.value,
    loadConversationDetail: async (conversationId) => {
      state.messages.value = await loadConversationMessages(conversationId)
      syncChatStreamingState(state)
    },
  })
}

export async function dispatchSendMessage(
  state: ChatStreamState,
  input: ChatSendInput,
) {
  if (!state.currentConversationId.value || state.streaming.value) {
    return
  }

  const payload = normalizeSendInput({
    ...input,
    provider: input.provider ?? state.selectedProvider.value,
    model: input.model ?? state.selectedModel.value,
  })
  if (!payload.content && !payload.parts?.length) {
    return
  }

  state.selectedProvider.value = payload.provider ?? state.selectedProvider.value
  state.selectedModel.value = payload.model ?? state.selectedModel.value

  const requestConversationId = state.currentConversationId.value
  const optimisticUserId = createTemporaryMessageId('user')
  const optimisticAssistantId = createTemporaryMessageId('assistant')
  state.messages.value.push(
    buildOptimisticUserMessage(optimisticUserId, payload.content, payload.parts),
    buildOptimisticAssistantMessage(
      optimisticAssistantId,
      payload.provider ?? null,
      payload.model ?? null,
      input.optimisticAssistantMetadata,
    ),
  )
  syncChatStreamingState(state)

  const controller = new AbortController()
  state.streamController.value = controller
  stopChatRecovery(state)

  try {
    await sendConversationMessage(
      requestConversationId,
      payload,
      (event) => {
        if (state.currentConversationId.value !== requestConversationId) {
          return
        }

        state.messages.value = applySseEvent(state.messages.value, event, {
          requestKind: 'send',
          optimisticUserId,
          optimisticAssistantId,
        })
        syncChatStreamingState(state)
      },
      controller.signal,
    )
  } catch (error) {
    const requestError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : '未知错误')
    if (requestError.name !== 'AbortError' && state.currentConversationId.value === requestConversationId) {
      state.messages.value = applyRequestError(
        state.messages.value,
        optimisticAssistantId,
        requestError,
      )
      syncChatStreamingState(state)
    }
  } finally {
    if (state.streamController.value === controller) {
      state.streamController.value = null
    }

    if (state.currentConversationId.value === requestConversationId) {
      scheduleChatRecovery(state)
    }
  }
}

export async function dispatchRetryMessage(
  state: ChatStreamState,
  messageId: string,
) {
  if (!state.currentConversationId.value || state.streaming.value) {
    return
  }

  const requestConversationId = state.currentConversationId.value
  const targetIndex = state.messages.value.findIndex((message) => message.id === messageId)
  if (targetIndex < 0) {
    return
  }

  const previousMessage = state.messages.value[targetIndex]
  state.messages.value = replaceMessage(state.messages.value, messageId, {
    ...previousMessage,
    content: '',
    toolCalls: [],
    toolResults: [],
    provider: state.selectedProvider.value,
    model: state.selectedModel.value,
    status: 'pending',
    error: null,
  })
  syncChatStreamingState(state)

  const controller = new AbortController()
  state.streamController.value = controller
  stopChatRecovery(state)

  try {
    await retryConversationMessage(
      requestConversationId,
      messageId,
      {
        provider: state.selectedProvider.value ?? undefined,
        model: state.selectedModel.value ?? undefined,
      },
      (event) => {
        if (state.currentConversationId.value !== requestConversationId) {
          return
        }

        state.messages.value = applySseEvent(state.messages.value, event, {
          requestKind: 'retry',
          targetMessageId: messageId,
        })
        syncChatStreamingState(state)
      },
      controller.signal,
    )
  } catch (error) {
    const requestError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : '未知错误')
    if (requestError.name !== 'AbortError' && state.currentConversationId.value === requestConversationId) {
      state.messages.value = applyRequestError(
        state.messages.value,
        messageId,
        requestError,
      )
      syncChatStreamingState(state)
    }
  } finally {
    if (state.streamController.value === controller) {
      state.streamController.value = null
    }

    if (state.currentConversationId.value === requestConversationId) {
      scheduleChatRecovery(state)
    }
  }
}
