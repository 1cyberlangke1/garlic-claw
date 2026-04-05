import type { useChatStore } from '@/features/chat/store/chat'
import { createChatViewModule } from '@/features/chat/modules/chat-view.module'
export type { PendingImage, UploadNotice } from '@/features/chat/modules/chat-view.module'

export function useChatView(chat: ReturnType<typeof useChatStore>) {
  return createChatViewModule(chat)
}
