import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import type {
  AiModelCapabilities,
  ChatMessagePart,
  ChatMessageMetadata,
  RuntimePermissionDecision,
} from '@garlic-claw/shared'
import {
  loadModelCapabilities,
  loadVisionFallbackEnabled,
} from '@/features/chat/composables/chat-view.data'
import { subscribeInternalConfigChanged } from '@/features/ai-settings/internal-config-change'

import type { useChatStore } from '@/features/chat/store/chat'
import {
  formatBytes,
  MAX_CHAT_IMAGE_DATA_URL_BYTES,
  MAX_CHAT_TOTAL_IMAGE_DATA_URL_BYTES,
  MIN_CHAT_IMAGE_DATA_URL_BYTES,
  prepareChatImageUpload,
  measureDataUrlBytes,
} from '@/utils/chat-image-upload'
import { useChatCommandCatalog } from '@/features/chat/composables/use-chat-command-catalog'

/**
 * 待发送图片。
 */
export interface PendingImage {
  id: string
  name: string
  image: string
  mimeType?: string
}

/**
 * 图片上传提示。
 */
export interface UploadNotice {
  id: string
  type: 'info' | 'error'
  text: string
}

/**
 * 聊天页的页面状态与交互逻辑。
 * 输入:
 * - chat store
 * 输出:
 * - 模型选择、图片上传、消息发送所需的响应式状态和方法
 * 预期行为:
 * - 页面组件只负责布局
 * - 上传预算、模型能力读取与发送逻辑统一收口
 */
export function createChatViewModule(chat: ReturnType<typeof useChatStore>) {
  const draftTextByConversationId = ref<Record<string, string>>({})
  const pendingImagesByConversationId = ref<Record<string, PendingImage[]>>({})
  const uploadProcessingNoticesByConversationId = ref<Record<string, UploadNotice[]>>({})
  const inputText = computed({
    get() {
      const conversationId = chat.currentConversationId
      return conversationId ? draftTextByConversationId.value[conversationId] ?? '' : ''
    },
    set(value: string) {
      const conversationId = chat.currentConversationId
      if (!conversationId) {
        return
      }
      draftTextByConversationId.value = {
        ...draftTextByConversationId.value,
        [conversationId]: value,
      }
    },
  })
  const pendingImages = computed({
    get() {
      return readConversationScopedList(
        pendingImagesByConversationId,
        chat.currentConversationId,
      )
    },
    set(value: PendingImage[]) {
      writeConversationScopedList(
        pendingImagesByConversationId,
        chat.currentConversationId,
        value,
      )
    },
  })
  const selectedCapabilities = ref<AiModelCapabilities | null>(null)
  const uploadProcessingNotices = computed({
    get() {
      return readConversationScopedList(
        uploadProcessingNoticesByConversationId,
        chat.currentConversationId,
      )
    },
    set(value: UploadNotice[]) {
      writeConversationScopedList(
        uploadProcessingNoticesByConversationId,
        chat.currentConversationId,
        value,
      )
    },
  })
  const visionFallbackEnabled = ref(false)
  let capabilityRequestId = 0
  const imageFallbackNotice = computed<UploadNotice[]>(() => {
    if (
      pendingImages.value.length === 0 ||
      !selectedCapabilities.value ||
      selectedCapabilities.value.input.image
    ) {
      return []
    }

    return [
      {
        id: 'image-fallback-notice',
        type: 'info',
        text: '当前模型不支持图片输入，发送时后端会按配置尝试 Vision Fallback；如果未启用视觉转述，则会退化为文本占位后继续发送。',
      },
    ]
  })
  const uploadNotices = computed<UploadNotice[]>(() => [
    ...imageFallbackNotice.value,
    ...uploadProcessingNotices.value,
  ])
  const displayedMessages = computed(() => chat.messages)
  const contextWindowPreview = computed(() => chat.contextWindowPreview)
  const pendingRuntimePermissions = computed(() => chat.pendingRuntimePermissions)
  const queuedSendCount = computed(() => chat.queuedSendCount)
  const queuedSendPreviewEntries = computed(() => chat.queuedSendPreviewEntries)
  const lastMessageRole = computed(() => {
    for (let index = displayedMessages.value.length - 1; index >= 0; index -= 1) {
      const message = displayedMessages.value[index]
      if (message.role !== 'display') {
        return message.role
      }
    }

    return null
  })
  const conversationSendDisabledReason = computed(() => null)
  const canSend = computed(() =>
    Boolean(inputText.value.trim() || pendingImages.value.length > 0),
  )
  const retryActionLabel = computed(() =>
    chat.retryableMessageId ? '重试' : lastMessageRole.value === 'user' ? '发送' : '重试',
  )
  const canTriggerRetryAction = computed(() => {
    if (chat.streaming) {
      return false
    }

    if (chat.retryableMessageId) {
      return true
    }

    return canSend.value
  })
  const shouldPreviewVisionFallback = computed(() =>
    visionFallbackEnabled.value &&
    pendingImages.value.length > 0 &&
    Boolean(selectedCapabilities.value) &&
    !selectedCapabilities.value?.input.image,
  )
  const {
    commandSuggestions,
    applyCommandSuggestion,
    resolveMatchedCommand,
  } = useChatCommandCatalog(inputText)

  watch(
    () => [chat.selectedProvider, chat.selectedModel],
    async ([provider, model]) => {
      await refreshSelectedCapabilities(provider, model)
    },
    { immediate: true },
  )
  const removeInternalConfigChangedListener = subscribeInternalConfigChanged(
    ({ scope }) => {
      if (scope === 'provider-models') {
        void refreshSelectedCapabilities(chat.selectedProvider, chat.selectedModel)
        return
      }
      if (scope === 'vision-fallback') {
        void refreshVisionFallbackAvailability()
      }
    },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      removeInternalConfigChangedListener()
    })
  }
  void refreshVisionFallbackAvailability()

  /**
   * 切换当前聊天所用模型。
   * @param selection provider/model 组合
   */
  function handleModelChange(selection: {
    providerId: string
    modelId: string
  }) {
    chat.setModelSelection({
      provider: selection.providerId,
      model: selection.modelId,
    })
  }

  /**
   * 把当前文本和待发送图片一起发给聊天 store。
   */
  async function send() {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }
    const draftText = draftTextByConversationId.value[conversationId] ?? ''
    const draftImages = [
      ...readConversationScopedList(
        pendingImagesByConversationId,
        conversationId,
      ),
    ]
    const draftNotices = [
      ...readConversationScopedList(
        uploadProcessingNoticesByConversationId,
        conversationId,
      ),
    ]
    const text = draftText.trim()

    if (!selectedCapabilities.value && chat.selectedProvider && chat.selectedModel) {
      await refreshSelectedCapabilities(chat.selectedProvider, chat.selectedModel)
    }
    const mayNeedVisionFallback =
      draftImages.length > 0 &&
      Boolean(selectedCapabilities.value) &&
      !selectedCapabilities.value?.input.image

    if (mayNeedVisionFallback && !visionFallbackEnabled.value) {
      await refreshVisionFallbackAvailability()
    }
    const optimisticAssistantMetadata = shouldPreviewVisionFallback.value
      ? {
        visionFallback: {
          state: 'transcribing',
          entries: [],
        },
      } satisfies ChatMessageMetadata
      : undefined
    const matchedCommand = draftImages.length === 0
      ? resolveMatchedCommand(text)
      : null
    const parts: ChatMessagePart[] = [
      ...draftImages.map((image) => ({
        type: 'image' as const,
        image: image.image,
        mimeType: image.mimeType,
      })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ]

    if (parts.length === 0) {
      return
    }

    writeConversationDraftText(draftTextByConversationId, conversationId, '')
    writeConversationScopedList(pendingImagesByConversationId, conversationId, [])
    writeConversationScopedList(uploadProcessingNoticesByConversationId, conversationId, [])
    try {
      await chat.sendMessage({
        content: text || undefined,
        parts,
        provider: chat.selectedProvider,
        model: chat.selectedModel,
        ...(matchedCommand
          ? {
            optimisticAssistantMetadata: mergeMessageMetadata(
              optimisticAssistantMetadata,
              createDisplayMessageMetadata('result'),
            ),
            optimisticAssistantRole: 'display' as const,
            optimisticUserMetadata: createDisplayMessageMetadata('command'),
            optimisticUserRole: 'display' as const,
          }
          : optimisticAssistantMetadata
            ? { optimisticAssistantMetadata }
            : {}),
      })
    } catch (error) {
      restoreConversationDraftAfterSendFailure({
        conversationId,
        draftText,
        draftImages,
        draftNotices,
        draftTextByConversationId,
        pendingImagesByConversationId,
        uploadProcessingNoticesByConversationId,
      })
      throw error
    }
  }

  /**
   * 在前端压缩图片并加入待发送队列。
   * @param event 文件选择事件
   */
  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement
    const files = Array.from(target.files ?? [])
    const conversationId = chat.currentConversationId

    if (!conversationId) {
      target.value = ''
      return
    }

    writeConversationScopedList(uploadProcessingNoticesByConversationId, conversationId, [])

    if (files.length === 0) {
      target.value = ''
      return
    }

    const nextImages: PendingImage[] = []
    const notices: UploadNotice[] = []
    let remainingBudget = Math.max(
      0,
      MAX_CHAT_TOTAL_IMAGE_DATA_URL_BYTES -
        getPendingImageBudgetBytes(
          readConversationScopedList(
            pendingImagesByConversationId,
            conversationId,
          ),
        ),
    )

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const remainingSlots = files.length - index
      const targetBytes = Math.min(
        MAX_CHAT_IMAGE_DATA_URL_BYTES,
        Math.floor(remainingBudget / remainingSlots),
      )

      if (targetBytes < MIN_CHAT_IMAGE_DATA_URL_BYTES) {
        notices.push({
          id: `${file.name}-${index}`,
          type: 'error',
          text: '图片总大小已接近聊天上传上限，请先删除部分图片后再继续上传。',
        })
        break
      }

      try {
        const prepared = await prepareChatImageUpload(file, targetBytes)
        nextImages.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          image: prepared.image,
          mimeType: prepared.mimeType,
        })
        remainingBudget -= prepared.compressedBytes

        if (prepared.compressed) {
          notices.push({
            id: `${file.name}-${index}-compressed`,
            type: 'info',
            text: `${file.name} 已压缩：${formatBytes(prepared.originalBytes)} -> ${formatBytes(prepared.compressedBytes)}`,
          })
        }
      } catch (error) {
        notices.push({
          id: `${file.name}-${index}-error`,
          type: 'error',
          text: `${file.name} 上传前压缩失败：${error instanceof Error ? error.message : '未知错误'}`,
        })
      }
    }

    const nextPendingImages = [
      ...readConversationScopedList(
        pendingImagesByConversationId,
        conversationId,
      ),
      ...nextImages,
    ]
    writeConversationScopedList(
      pendingImagesByConversationId,
      conversationId,
      nextPendingImages,
    )
    writeConversationScopedList(
      uploadProcessingNoticesByConversationId,
      conversationId,
      notices,
    )
    target.value = ''
  }

  /**
   * 删除待发送队列中的一张图片。
   * @param index 图片索引
   */
  function removeImage(index: number) {
    pendingImages.value.splice(index, 1)
  }

  /**
   * 更新一条现有消息。
   * @param payload 修改后的消息内容
   */
  async function updateMessage(payload: {
    messageId: string
    content?: string
    parts?: ChatMessagePart[]
  }) {
    await chat.updateMessage(payload.messageId, payload)
  }

  /**
   * 删除一条现有消息。
   * @param messageId 要删除的消息 ID
   */
  async function deleteMessage(messageId: string) {
    await chat.deleteMessage(messageId)
  }

  /**
   * 原地重试最后一条 assistant 回复。
   * @param messageId assistant 消息 ID
   */
  async function retryMessage(messageId: string) {
    await chat.retryMessage(messageId)
  }

  /**
   * 根据当前会话状态执行“重试”按钮的真实动作。
   * 输入:
   * - 无，直接读取当前会话末尾消息与草稿状态
   * 输出:
   * - 存在可重试 assistant 时原地重试
   * - 否则退化为发送当前草稿
   * 预期行为:
   * - 按钮位置固定，不再因为有无可重试消息频繁跳布局
   */
  async function triggerRetryAction() {
    if (chat.streaming) {
      return
    }

    if (chat.retryableMessageId) {
      await retryMessage(chat.retryableMessageId)
      return
    }

    await send()
  }

  /**
   * 读取并同步当前选择模型的能力，忽略已过期的旧请求。
   * @param providerId 当前 provider
   * @param modelId 当前模型
   */
  async function refreshSelectedCapabilities(
    providerId: string | null,
    modelId: string | null,
  ) {
    const requestId = ++capabilityRequestId
    if (!providerId || !modelId) {
      selectedCapabilities.value = null
      return
    }

    const capabilities = await loadModelCapabilities(providerId, modelId)
    if (
      requestId !== capabilityRequestId ||
      chat.selectedProvider !== providerId ||
      chat.selectedModel !== modelId
    ) {
      return
    }

    selectedCapabilities.value = capabilities
  }

  /**
   * 读取当前是否启用了 Vision Fallback。
   */
  async function refreshVisionFallbackAvailability() {
    visionFallbackEnabled.value = await loadVisionFallbackEnabled()
  }

  async function replyRuntimePermission(requestId: string, decision: RuntimePermissionDecision) {
    await chat.replyRuntimePermission(requestId, decision)
  }

  function popQueuedSendTailToInput() {
    const popped = chat.popQueuedSendRequestTail()
    if (!popped) {
      return
    }
    inputText.value = readQueuedDraftText(popped)
    pendingImages.value = readQueuedDraftImages(popped.parts)
  }

  return {
    inputText,
    pendingImages,
    commandSuggestions,
    displayedMessages,
    contextWindowPreview,
    pendingRuntimePermissions,
    queuedSendCount,
    queuedSendPreviewEntries,
    selectedCapabilities,
    conversationSendDisabledReason,
    uploadNotices,
    canSend,
    canTriggerRetryAction,
    retryActionLabel,
    retryableMessageId: chat.retryableMessageId,
    handleModelChange,
    send,
    handleFileChange,
    removeImage,
    updateMessage,
    deleteMessage,
    retryMessage,
    triggerRetryAction,
    replyRuntimePermission,
    popQueuedSendTailToInput,
    applyCommandSuggestion,
  }
}

/**
 * 统计当前待发送图片已经占用的 data URL 字节数。
 * @returns 当前图片预算占用
 */
function getPendingImageBudgetBytes(images: PendingImage[] = []): number {
  return images.reduce(
    (total, image) => total + measureDataUrlBytes(image.image),
    0,
  )
}

function readConversationScopedList<T>(
  bucket: { value: Record<string, T[]> },
  conversationId: string | null,
): T[] {
  if (!conversationId) {
    return []
  }
  const existing = bucket.value[conversationId]
  if (existing) {
    return existing
  }
  const created: T[] = []
  bucket.value = {
    ...bucket.value,
    [conversationId]: created,
  }
  return created
}

function writeConversationScopedList<T>(
  bucket: { value: Record<string, T[]> },
  conversationId: string | null,
  value: T[],
): void {
  if (!conversationId) {
    return
  }
  bucket.value = {
    ...bucket.value,
    [conversationId]: value,
  }
}

function writeConversationDraftText(
  bucket: { value: Record<string, string> },
  conversationId: string | null,
  value: string,
): void {
  if (!conversationId) {
    return
  }
  bucket.value = {
    ...bucket.value,
    [conversationId]: value,
  }
}

function restoreConversationDraftAfterSendFailure(input: {
  conversationId: string
  draftText: string
  draftImages: PendingImage[]
  draftNotices: UploadNotice[]
  draftTextByConversationId: { value: Record<string, string> }
  pendingImagesByConversationId: { value: Record<string, PendingImage[]> }
  uploadProcessingNoticesByConversationId: { value: Record<string, UploadNotice[]> }
}): void {
  const currentDraftText = input.draftTextByConversationId.value[input.conversationId] ?? ''
  const currentPendingImages = input.pendingImagesByConversationId.value[input.conversationId] ?? []
  const currentNotices = input.uploadProcessingNoticesByConversationId.value[input.conversationId] ?? []

  if (!currentDraftText) {
    writeConversationDraftText(
      input.draftTextByConversationId,
      input.conversationId,
      input.draftText,
    )
  }
  if (currentPendingImages.length === 0) {
    writeConversationScopedList(
      input.pendingImagesByConversationId,
      input.conversationId,
      input.draftImages,
    )
  }
  if (currentNotices.length === 0) {
    writeConversationScopedList(
      input.uploadProcessingNoticesByConversationId,
      input.conversationId,
      input.draftNotices,
    )
  }
}

function readQueuedDraftText(input: { content?: string; parts?: ChatMessagePart[] }): string {
  const content = input.content?.trim()
  if (content) {
    return content
  }
  if (!input.parts?.length) {
    return ''
  }
  return input.parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')
}

function readQueuedDraftImages(parts: ChatMessagePart[] | undefined): PendingImage[] {
  if (!parts?.length) {
    return []
  }
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'image' }> => part.type === 'image')
    .map((part, index) => ({
      id: `queued-image-${index}-${part.image.slice(0, 24)}`,
      image: part.image,
      mimeType: part.mimeType,
      name: `队列图片 ${index + 1}`,
    }))
}

function createDisplayMessageMetadata(variant: 'command' | 'result'): ChatMessageMetadata {
  return {
    annotations: [
      {
        data: {
          variant,
        },
        owner: 'conversation.display-message',
        type: 'display-message',
        version: '1',
      },
    ],
  }
}

function mergeMessageMetadata(
  base: ChatMessageMetadata | undefined,
  extra: ChatMessageMetadata,
): ChatMessageMetadata {
  if (!base) {
    return extra
  }

  return {
    ...base,
    ...(extra.annotations
      ? {
        annotations: [
          ...(base.annotations ?? []),
          ...extra.annotations,
        ],
      }
      : {}),
  }
}
