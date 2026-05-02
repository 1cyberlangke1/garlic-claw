import { computed, defineComponent, ref, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import { usePluginStorage } from '@/features/plugins/composables/use-plugin-storage'
import * as pluginData from '@/features/plugins/composables/plugin-management.data'

vi.mock('@/features/plugins/composables/plugin-management.data', () => ({
  deletePluginStorageEntry: vi.fn(),
  loadPluginStorage: vi.fn(),
  savePluginStorageEntry: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('usePluginStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores stale storage responses after switching plugins and resets prefix on detail clear', async () => {
    let resolveAlpha!: (value: Array<{ key: string; value: string }>) => void
    const alphaResult = new Promise<Array<{ key: string; value: string }>>((resolve) => {
      resolveAlpha = resolve
    })
    vi.mocked(pluginData.loadPluginStorage).mockImplementation((pluginName) => {
      if (pluginName === 'builtin.alpha') {
        return alphaResult
      }
      return Promise.resolve([
        {
          key: 'beta.key',
          value: 'beta-value',
        },
      ])
    })

    const selectedPlugin = shallowRef<PluginInfo | null>({
      id: 'plugin-1',
      name: 'builtin.alpha',
    } as PluginInfo)
    const detailLoading = ref(false)
    const error = ref<string | null>(null)
    const notice = ref<string | null>(null)
    let state!: ReturnType<typeof usePluginStorage>
    const Harness = defineComponent({
      setup() {
        state = usePluginStorage({
          selectedPlugin: computed(() => selectedPlugin.value),
          detailLoading,
          error,
          notice,
        })
        return () => null
      },
    })

    mount(Harness)
    state.storagePrefix.value = 'cursor.'
    void state.refreshPluginStorage()
    await flushPromises()

    selectedPlugin.value = {
      id: 'plugin-2',
      name: 'builtin.beta',
    } as PluginInfo
    state.clearDetailState()
    expect(state.storagePrefix.value).toBe('')

    await state.refreshPluginStorage()
    await flushPromises()
    expect(state.storageEntries.value).toEqual([
      {
        key: 'beta.key',
        value: 'beta-value',
      },
    ])

    resolveAlpha([
      {
        key: 'alpha.key',
        value: 'alpha-value',
      },
    ])
    await flushPromises()

    expect(state.storageEntries.value).toEqual([
      {
        key: 'beta.key',
        value: 'beta-value',
      },
    ])
    expect(state.storagePrefix.value).toBe('')
  })
})
