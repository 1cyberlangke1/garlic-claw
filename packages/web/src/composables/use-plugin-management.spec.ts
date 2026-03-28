import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'
import { usePluginManagement } from './use-plugin-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listPlugins: vi.fn(),
  getPluginConfig: vi.fn(),
  getPluginCrons: vi.fn(),
  getPluginScope: vi.fn(),
  getPluginHealth: vi.fn(),
  listPluginEvents: vi.fn(),
  listPluginStorage: vi.fn(),
}))

describe('usePluginManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs refreshed health snapshots back into the sidebar plugin list', async () => {
    const initialPlugin: PluginInfo = {
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
      },
      lastSeenAt: '2026-03-28T00:00:00.000Z',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    }
    const refreshedHealth: PluginHealthSnapshot = {
      status: 'degraded',
      failureCount: 3,
      consecutiveFailures: 2,
      lastError: 'tool overloaded',
      lastErrorAt: '2026-03-28T00:05:00.000Z',
      lastSuccessAt: '2026-03-28T00:04:00.000Z',
      lastCheckedAt: '2026-03-28T00:05:00.000Z',
      runtimePressure: {
        activeExecutions: 2,
        maxConcurrentExecutions: 6,
      },
    }

    vi.mocked(api.listPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(api.getPluginConfig).mockResolvedValue({
      schema: null,
      values: {},
    })
    vi.mocked(api.getPluginCrons).mockResolvedValue([])
    vi.mocked(api.getPluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {},
    })
    vi.mocked(api.getPluginHealth).mockResolvedValue(refreshedHealth)
    vi.mocked(api.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(api.listPluginStorage).mockResolvedValue([])

    let state!: ReturnType<typeof usePluginManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.healthSnapshot.value).toEqual(refreshedHealth)
    expect(state.plugins.value[0]?.health).toEqual(refreshedHealth)
  })
})
