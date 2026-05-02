import { defineStore } from 'pinia'
import { createChatStoreModule } from '@/modules/chat/modules/chat-store.module'
export type {
  ChatMessage,
  ChatSendInput,
  ChatToolCallEntry,
  ChatToolResultEntry,
} from '@/modules/chat/store/chat-store.types'

export const useChatStore = defineStore('chat', () => createChatStoreModule())
