import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatView from '@/features/chat/views/ChatView.vue'

const applyCommandSuggestion = vi.fn()
const replyRuntimePermission = vi.fn()
const selectConversation = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
    selectedProvider: 'demo-provider',
    selectedModel: 'demo-model',
    messages: [],
    todoItems: [
      {
        content: '实现 todo 面板',
        priority: 'high',
        status: 'in_progress',
      },
    ],
    loading: false,
    streaming: false,
    selectConversation,
    stopStreaming: vi.fn(),
  }),
}))

vi.mock('@/features/chat/composables/use-chat-view', () => ({
  useChatView: () => ({
    inputText: ref(''),
    pendingImages: ref([]),
    displayedMessages: ref([]),
    contextWindowPreview: ref(null),
    commandSuggestions: ref([
      {
        commandId: 'internal.context-governance:/compact:command',
        trigger: '/compact',
        canonicalCommand: '/compact',
        pluginId: 'internal.context-governance',
        pluginDisplayName: '上下文压缩',
        connected: true,
        defaultEnabled: true,
        kind: 'command',
      },
    ]),
    selectedCapabilities: ref(null),
    pendingRuntimePermissions: ref([
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 pwd',
        resolving: false,
      },
    ]),
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
    replyRuntimePermission,
    applyCommandSuggestion,
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
  beforeEach(() => {
    applyCommandSuggestion.mockReset()
    replyRuntimePermission.mockReset()
    selectConversation.mockReset()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    })
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

  it('passes command suggestions and selection events into the composer', async () => {
    const wrapper = mount(ChatView, {
      global: {
        stubs: {
          ChatMessageList: { template: '<div class="chat-message-list" />' },
          ChatComposer: {
            props: ['commandSuggestions'],
            emits: ['apply-command-suggestion'],
            template: '<button class="chat-composer" @click="$emit(\'apply-command-suggestion\', commandSuggestions[0]?.trigger)">{{ commandSuggestions[0]?.trigger }}</button>',
          },
          ModelQuickInput: { template: '<div class="model-quick-input" />' },
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.chat-composer').text()).toContain('/compact')

    await wrapper.find('.chat-composer').trigger('click')

    expect(applyCommandSuggestion).toHaveBeenCalledWith('/compact')
  })

  it('renders the current conversation todo panel', async () => {
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

    expect(wrapper.text()).toContain('当前待办')
    expect(wrapper.text()).toContain('实现 todo 面板')
    expect(wrapper.text()).toContain('进行中')
  })

  it('passes pending runtime permission requests into the approval panel', async () => {
    const wrapper = mount(ChatView, {
      global: {
        stubs: {
          ChatMessageList: { template: '<div class="chat-message-list" />' },
          ChatComposer: { template: '<div class="chat-composer" />' },
          ModelQuickInput: { template: '<div class="model-quick-input" />' },
          ChatRuntimePermissionPanel: {
            props: ['requests'],
            emits: ['reply'],
            template: '<button class="permission-panel" @click="$emit(\'reply\', requests[0]?.id, \'always\')">{{ requests[0]?.toolName }}</button>',
          },
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.permission-panel').text()).toContain('bash')

    await wrapper.find('.permission-panel').trigger('click')

    expect(replyRuntimePermission).toHaveBeenCalledWith('permission-1', 'always')
  })

  it('switches subagent tabs through chat.selectConversation instead of mutating the current id directly', async () => {
    const childConversationId = '019dd900-1234-7abc-8def-1234567890ab'
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: childConversationId,
          title: '子代理窗口',
          createdAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:00.000Z',
          _count: { messages: 1 },
        },
      ]),
    })

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

    const tabs = wrapper.findAll('.chat-tab')
    expect(tabs).toHaveLength(2)

    await tabs[1].trigger('click')

    expect(selectConversation).toHaveBeenCalledWith(childConversationId)
  })
})
