import { defineComponent, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as chatViewData from '@/features/chat/composables/chat-view.data'
import { useChatView } from '@/features/chat/composables/use-chat-view'

vi.mock('@/features/chat/composables/chat-view.data', () => ({
  loadModelCapabilities: vi.fn(),
  loadVisionFallbackEnabled: vi.fn(),
}))

vi.mock('@/features/chat/composables/chat-command-catalog.data', () => ({
  loadChatCommandCatalog: vi.fn().mockResolvedValue({
    version: 'catalog-v1',
    commands: [
      {
        aliases: ['/compress'],
        canonicalCommand: '/compact',
        commandId: 'internal.context-governance:/compact:command',
        conflictTriggers: [],
        connected: true,
        defaultEnabled: true,
        kind: 'command',
        path: ['compact'],
        pluginDisplayName: '上下文压缩',
        pluginId: 'internal.context-governance',
        runtimeKind: 'local',
        source: 'manifest',
        variants: ['/compact', '/compress'],
      },
    ],
    conflicts: [],
  }),
  loadChatCommandCatalogVersion: vi.fn().mockResolvedValue({
    version: 'catalog-v1',
  }),
}))

function createModelConfig(inputImage: boolean, id = inputImage ? 'image-model' : 'text-only-model') {
  return {
    id,
    providerId: 'demo-provider',
    name: inputImage ? 'Vision Model' : 'Text Only',
    capabilities: {
      reasoning: false,
      toolCall: false,
      input: {
        text: true,
        image: inputImage,
      },
      output: {
        text: true,
        image: false,
      },
    },
    api: {
      id,
      url: 'https://example.com/v1/chat/completions',
      npm: '@example/sdk',
    },
  }
}

function createChatStub(overrides: Partial<Record<string, unknown>> = {}) {
  return reactive({
    messages: [],
    streaming: false,
    retryableMessageId: null,
    currentConversationId: 'conversation-1' as string | null,
    selectedProvider: 'demo-provider' as string | null,
    selectedModel: 'text-only-model' as string | null,
    queuedSendCount: ref(0),
    queuedSendPreviewEntries: ref([]),
    setModelSelection(selection: { provider: string | null; model: string | null }) {
      this.selectedProvider = selection.provider
      this.selectedModel = selection.model
    },
    popQueuedSendRequestTail: vi.fn().mockReturnValue(null),
    sendMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    retryMessage: vi.fn(),
    ...overrides,
  })
}

describe('useChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chatViewData.loadVisionFallbackEnabled).mockResolvedValue(false)
    vi.mocked(chatViewData.loadModelCapabilities).mockResolvedValue(
      createModelConfig(false, 'text-only-model').capabilities,
    )
  })

  it('shows a fallback notice when pending images target a text-only model', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.pendingImages.value.push({
      id: 'image-1',
      name: 'demo.png',
      image: 'data:image/png;base64,Zm9v',
      mimeType: 'image/png',
    })
    await nextTick()

    expect(state.uploadNotices.value).toContainEqual(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('当前模型不支持图片输入'),
      }),
    )
    expect(state.uploadNotices.value).toContainEqual(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('Vision Fallback'),
      }),
    )
  })

  it('keeps the latest model capabilities when an older request resolves later', async () => {
    let resolveFirst!: (value: ReturnType<typeof createModelConfig>['capabilities'] | null) => void
    const firstRequest = new Promise<ReturnType<typeof createModelConfig>['capabilities'] | null>((resolve) => {
      resolveFirst = resolve
    })

    vi.mocked(chatViewData.loadModelCapabilities)
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce(createModelConfig(true, 'image-model').capabilities)

    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await nextTick()

    state.handleModelChange({
      providerId: 'demo-provider',
      modelId: 'image-model',
    })
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)

    resolveFirst(createModelConfig(false, 'text-only-model').capabilities)
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)
  })

  it('marks the optimistic assistant as transcribing when vision fallback will be used', async () => {
    vi.mocked(chatViewData.loadVisionFallbackEnabled).mockResolvedValue(true)

    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.pendingImages.value.push({
      id: 'image-1',
      name: 'demo.png',
      image: 'data:image/png;base64,Zm9v',
      mimeType: 'image/png',
    })
    await nextTick()

    await state.send()

    expect(chat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticAssistantMetadata: {
          visionFallback: {
            state: 'transcribing',
            entries: [],
          },
        },
      }),
    )
  })

  it('marks matched slash commands as display messages before the server echoes them back', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.inputText.value = '/compact'
    await nextTick()
    await state.send()

    expect(chat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticAssistantRole: 'display',
        optimisticUserRole: 'display',
        optimisticUserMetadata: expect.objectContaining({
          annotations: [
            expect.objectContaining({
              data: {
                variant: 'command',
              },
              owner: 'conversation.display-message',
              type: 'display-message',
            }),
          ],
        }),
        optimisticAssistantMetadata: expect.objectContaining({
          annotations: [
            expect.objectContaining({
              data: {
                variant: 'result',
              },
              owner: 'conversation.display-message',
              type: 'display-message',
            }),
          ],
        }),
      }),
    )
  })

  it('keeps send enabled while streaming so later messages can enter the queue', async () => {
    const chat = createChatStub({
      streaming: true,
    })
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.inputText.value = '排队消息'
    await nextTick()

    expect(state.canSend.value).toBe(true)
  })

  it('keeps text drafts isolated between conversations', async () => {
    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.inputText.value = '会话一草稿'
    chat.currentConversationId = 'conversation-2'
    await nextTick()

    expect(state.inputText.value).toBe('')

    state.inputText.value = '会话二草稿'
    chat.currentConversationId = 'conversation-1'
    await nextTick()

    expect(state.inputText.value).toBe('会话一草稿')
  })

  it('computes retry label from the last non-display message', async () => {
    const chat = createChatStub({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: '你好',
          status: 'completed',
          error: null,
        },
        {
          id: 'display-1',
          role: 'display',
          content: '压缩摘要',
          status: 'completed',
          error: null,
        },
      ],
    })
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.retryActionLabel.value).toBe('发送')
  })
})
