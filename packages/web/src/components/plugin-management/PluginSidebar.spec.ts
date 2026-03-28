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

  it('surfaces busy plugins before idle ones in the sidebar list', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.alpha',
            displayName: 'Alpha Plugin',
            description: 'alpha',
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
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'builtin.busy',
            displayName: 'Busy Plugin',
            description: 'busy',
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
              lastSuccessAt: null,
              lastCheckedAt: null,
              runtimePressure: {
                activeExecutions: 6,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    const titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles[0]).toBe('Busy Plugin')
    expect(titles[1]).toBe('Alpha Plugin')
  })

  it('shows a short issue summary for busy and unhealthy plugins', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.busy',
            displayName: 'Busy Plugin',
            description: 'busy',
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
              lastSuccessAt: null,
              lastCheckedAt: null,
              runtimePressure: {
                activeExecutions: 6,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'remote.error',
            displayName: 'Error Plugin',
            description: 'error',
            deviceType: 'api',
            status: 'error',
            capabilities: [],
            connected: false,
            runtimeKind: 'remote',
            health: {
              status: 'error',
              failureCount: 3,
              consecutiveFailures: 2,
              lastError: 'route timeout while invoking remote endpoint',
              lastErrorAt: '2026-03-28T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('当前并发已打满')
    expect(wrapper.text()).toContain('最近错误：route timeout while invoking remote endpoint')
  })
})
