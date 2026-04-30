import { defineStore } from 'pinia'
import { createChatStoreModule } from '@/features/chat/modules/chat-store.module'
export type {
  ChatMessage,
  ChatSendInput,
  ChatToolCallEntry,
  ChatToolResultEntry,
} from '@/features/chat/store/chat-store.types'

export const useChatStore = defineStore('chat', () => createChatStoreModule())
