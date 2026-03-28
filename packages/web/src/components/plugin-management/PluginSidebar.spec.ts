import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginSidebar from './PluginSidebar.vue'

describe('PluginSidebar', () => {
  it('shows runtime pressure in the sidebar when a plugin is currently busy', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: 'builtin.demo',
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.demo',
            displayName: 'Demo Plugin',
            description: 'demo',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: '2026-03-28T00:00:00.000Z',
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
              runtimePressure: {
                activeExecutions: 2,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('并发 2 / 6')
  })
})
