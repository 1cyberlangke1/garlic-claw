import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ChatWorkbenchLayout from './ChatWorkbenchLayout.vue'

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    conversations: [
      {
        id: 'conversation-1',
        title: '最近一次对话',
      },
    ],
    currentConversationId: 'conversation-1',
    loadConversations: vi.fn(),
    createConversation: vi.fn(async () => ({
      id: 'conversation-2',
      title: '新对话',
    })),
    selectConversation: vi.fn(),
    deleteConversation: vi.fn(),
  }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: {
      username: 'codex',
    },
    logout: vi.fn(),
  }),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
    }),
    useRoute: () => ({
      name: 'chat',
    }),
  }
})

describe('ChatWorkbenchLayout', () => {
  it('renders the conversation rail without admin workspace controls mixed into the main view', () => {
    const wrapper = mount(ChatWorkbenchLayout, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
          RouterView: {
            template: '<div class="router-view-stub" />',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('最近一次对话')
    expect(wrapper.text()).toContain('新对话')
    expect(wrapper.text()).toContain('管理后台')
  })
})
