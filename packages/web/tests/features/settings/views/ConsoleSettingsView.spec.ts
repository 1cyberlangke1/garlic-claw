import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAdminShellPreferences } from '@/modules/admin/modules/admin-shell-preferences'
import { useThemeStore } from '@/shared/stores/theme'
import ConsoleSettingsView from '@/modules/settings/views/ConsoleSettingsView.vue'

describe('ConsoleSettingsView', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    })
    const { setTopbarCollapsed, setTopbarPullCordEnabled } = useAdminShellPreferences()
    setTopbarPullCordEnabled(true)
    setTopbarCollapsed(false)
    const theme = useThemeStore()
    theme.setDarkMode()
  })

  it('toggles the topbar pull cord preference and allows theme changes', async () => {
    const wrapper = mount(ConsoleSettingsView, {
      global: {
        plugins: [pinia],
      },
    })
    const { topbarPullCordEnabled } = useAdminShellPreferences()
    const theme = useThemeStore()

    expect(wrapper.text()).toContain('切换深色模式')
    expect(wrapper.text()).toContain('深色模式跟随系统')
    expect(topbarPullCordEnabled.value).toBe(true)
    expect(theme.isDark).toBe(true)

    await wrapper.get('[aria-label="启用顶栏拉绳按钮"]').trigger('click')

    expect(topbarPullCordEnabled.value).toBe(false)
    expect(localStorage.getItem('garlic-claw:admin-topbar-pull-cord-enabled')).toBe('false')

    await wrapper.get('[aria-label="切换深色模式"]').trigger('click')

    expect(theme.isDark).toBe(false)
    expect(theme.followSystem).toBe(false)

    await wrapper.get('[aria-label="深色模式跟随系统"]').trigger('click')

    expect(theme.followSystem).toBe(true)
    expect(localStorage.getItem('garlic-claw:theme')).toBe('system')
  })
})
