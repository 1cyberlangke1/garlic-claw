import type { useChatStore } from '@/modules/chat/store/chat'
import { createChatViewModule } from '@/modules/chat/modules/chat-view.module'
export type { PendingImage, UploadNotice } from '@/modules/chat/modules/chat-view.module'

export function useChatView(chat: ReturnType<typeof useChatStore>) {
  return createChatViewModule(chat)
}
