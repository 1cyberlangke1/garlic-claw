import { computed, defineComponent, ref, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import { usePluginEvents } from '@/modules/plugins/composables/use-plugin-events'
import * as pluginData from '@/modules/plugins/composables/plugin-management.data'

vi.mock('@/modules/plugins/composables/plugin-management.data', () => ({
  dedupeEventLogs: vi.fn((items) => items),
  loadPluginEvents: vi.fn(),
  normalizeEventQuery: vi.fn((query) => ({
    limit: query.limit ?? 50,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('usePluginEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads more plugin events with nextCursor and appends the next page', async () => {
    vi.mocked(pluginData.loadPluginEvents)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-3',
            type: 'plugin:error',
            level: 'error',
            message: 'third',
            metadata: null,
            createdAt: '2026-04-21T00:00:03.000Z',
          },
          {
            id: 'event-2',
            type: 'plugin:warn',
            level: 'warn',
            message: 'second',
            metadata: null,
            createdAt: '2026-04-21T00:00:02.000Z',
          },
        ],
        nextCursor: 'event-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-1',
            type: 'plugin:info',
            level: 'info',
            message: 'first',
            metadata: null,
            createdAt: '2026-04-21T00:00:01.000Z',
          },
        ],
        nextCursor: null,
      })

    const selectedPlugin = shallowRef<PluginInfo | null>({
      id: 'plugin-1',
      name: 'builtin.demo',
    } as PluginInfo)
    const error = ref<string | null>(null)
    let state!: ReturnType<typeof usePluginEvents>
    const Harness = defineComponent({
      setup() {
        state = usePluginEvents({
          selectedPlugin: computed(() => selectedPlugin.value),
          error,
        })
        return () => null
      },
    })

    mount(Harness)
    await state.refreshPluginEvents()
    await flushPromises()

    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2'])
    expect(state.eventNextCursor.value).toBe('event-2')

    await state.loadMorePluginEvents()
    await flushPromises()

    expect(pluginData.loadPluginEvents).toHaveBeenNthCalledWith(2, 'builtin.demo', {
      limit: 50,
      cursor: 'event-2',
    })
    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2', 'event-1'])
    expect(state.eventNextCursor.value).toBeNull()
  })
})
