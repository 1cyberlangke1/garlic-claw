import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminConsoleLayout from '@/features/admin/layouts/AdminConsoleLayout.vue'

const authState = {
  logout: vi.fn(),
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
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

describe('AdminConsoleLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1280,
    })
  })

  function mountLayout() {
    return mount(AdminConsoleLayout, {
      global: {
        plugins: [createPinia()],
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
  }

  it('renders the unified single-user navigation without the api key entry', () => {
    const wrapper = mountLayout()

    expect(wrapper.text()).toContain('对话')
    expect(wrapper.text()).toContain('工具')
    expect(wrapper.text()).toContain('插件')
    expect(wrapper.text()).toContain('MCP')
    expect(wrapper.text()).toContain('技能')
    expect(wrapper.text()).toContain('AI 设置')
    expect(wrapper.text()).toContain('自动化')
    expect(wrapper.text()).toContain('控制台')
    expect(wrapper.text()).toContain('退出登录')
    expect(wrapper.text()).not.toContain('API Keys')
    expect(wrapper.get('.admin-topbar').text()).toContain('退出登录')
    expect(wrapper.get('.admin-nav').text()).not.toContain('退出登录')
  })

  it('restores the saved expanded width from localStorage', async () => {
    localStorage.setItem('garlic-claw:admin-sider-mode', 'expanded')
    localStorage.setItem('garlic-claw:admin-sider-width', '280')

    const wrapper = mountLayout()
    await nextTick()

    expect(wrapper.get('.admin-nav').attributes('style')).toContain('width: 280px;')
    expect(wrapper.get('[data-test="admin-sider-resize-handle"]').attributes('aria-label')).toBe('调整侧栏宽度')
  })

  it('updates expanded width when dragging the resize handle', async () => {
    localStorage.setItem('garlic-claw:admin-sider-mode', 'expanded')

    const wrapper = mountLayout()
    await wrapper.get('[data-test="admin-sider-resize-handle"]').trigger('mousedown', {
      clientX: 200,
    })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 320 }))
    await nextTick()
    window.dispatchEvent(new MouseEvent('mouseup'))
    await nextTick()

    expect(wrapper.get('.admin-nav').attributes('style')).toContain('width: 300px;')
    expect(localStorage.getItem('garlic-claw:admin-sider-width')).toBe('300')
  })
})
