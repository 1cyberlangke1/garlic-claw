import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ChatView from '@/features/chat/views/ChatView.vue'

const compactConversationContext = vi.fn()

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
    selectedProvider: 'demo-provider',
    selectedModel: 'demo-model',
    messages: [],
    loading: false,
    streaming: false,
    stopStreaming: vi.fn(),
  }),
}))

vi.mock('@/features/chat/composables/use-chat-view', () => ({
  useChatView: () => ({
    inputText: ref(''),
    pendingImages: ref([]),
    compacting: ref(false),
    selectedCapabilities: ref(null),
    conversationHostServices: ref({
      sessionEnabled: true,
      llmEnabled: true,
      ttsEnabled: true,
    }),
    conversationSendDisabledReason: ref(null),
    uploadNotices: ref([]),
    canSend: ref(false),
    canTriggerRetryAction: ref(false),
    retryActionLabel: ref('发送'),
    handleModelChange: vi.fn(),
    send: vi.fn(),
    handleFileChange: vi.fn(),
    removeImage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    retryMessage: vi.fn(),
    triggerRetryAction: vi.fn(),
    setConversationLlmEnabled: vi.fn(),
    setConversationSessionEnabled: vi.fn(),
    compactConversationContext,
  }),
}))

vi.mock('@/features/personas/composables/persona-settings.data', () => ({
  loadCurrentPersona: vi.fn().mockResolvedValue({
    avatar: '/api/personas/persona.writer/avatar',
    name: 'Writer',
    personaId: 'persona.writer',
    source: 'conversation',
  }),
}))

describe('ChatView', () => {
  it('renders the compact context action and delegates clicks to the chat view module', async () => {
    compactConversationContext.mockReset()
    const wrapper = mount(ChatView, {
      global: {
        stubs: {
          ChatMessageList: { template: '<div class="chat-message-list" />' },
          ChatComposer: { template: '<div class="chat-composer" />' },
          ModelQuickInput: { template: '<div class="model-quick-input" />' },
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    const compactButton = wrapper.findAll('button.service-toggle').find((button) =>
      button.text().includes('压缩上下文'),
    )
    expect(compactButton?.exists()).toBe(true)

    await compactButton?.trigger('click')

    expect(compactConversationContext).toHaveBeenCalledTimes(1)
  })

  it('passes the current persona avatar into the message list', async () => {
    const wrapper = mount(ChatView, {
      global: {
        stubs: {
          ChatMessageList: {
            props: ['assistantPersona'],
            template: '<div class="chat-message-list">{{ assistantPersona?.name }}|{{ assistantPersona?.avatar }}</div>',
          },
          ChatComposer: { template: '<div class="chat-composer" />' },
          ModelQuickInput: { template: '<div class="model-quick-input" />' },
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.chat-message-list').text()).toContain('Writer|/api/personas/persona.writer/avatar')
  })
})
