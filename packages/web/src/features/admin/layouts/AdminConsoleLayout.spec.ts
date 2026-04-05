import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AdminConsoleLayout from './AdminConsoleLayout.vue'

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
      name: 'plugins',
    }),
  }
})

describe('AdminConsoleLayout', () => {
  it('renders admin navigation without the chat conversation rail', () => {
    const wrapper = mount(AdminConsoleLayout, {
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

    expect(wrapper.text()).toContain('插件')
    expect(wrapper.text()).toContain('工具')
    expect(wrapper.text()).toContain('AI 设置')
    expect(wrapper.text()).toContain('返回对话')
    expect(wrapper.text()).not.toContain('新对话')
  })
})
