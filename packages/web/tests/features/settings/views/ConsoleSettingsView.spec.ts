import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAdminShellPreferences } from '@/features/admin/modules/admin-shell-preferences'
import ConsoleSettingsView from '@/features/settings/views/ConsoleSettingsView.vue'

describe('ConsoleSettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
    const { setTopbarCollapsed, setTopbarPullCordEnabled } = useAdminShellPreferences()
    setTopbarPullCordEnabled(true)
    setTopbarCollapsed(false)
  })

  it('toggles the topbar pull cord preference', async () => {
    const wrapper = mount(ConsoleSettingsView)
    const { topbarPullCordEnabled } = useAdminShellPreferences()

    expect(wrapper.text()).toContain('顶部拉绳收起')
    expect(topbarPullCordEnabled.value).toBe(true)

    await wrapper.get('[role="switch"]').trigger('click')

    expect(topbarPullCordEnabled.value).toBe(false)
    expect(localStorage.getItem('garlic-claw:admin-topbar-pull-cord-enabled')).toBe('false')
  })
})
