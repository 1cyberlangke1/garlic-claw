import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/plugins/api/plugins', () => ({
  listPluginEvents: vi.fn(),
}))

describe('plugin-management.data', async () => {
  const pluginApi = await import('@/features/plugins/api/plugins')
  const pluginData = await import('@/features/plugins/composables/plugin-management.data')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(pluginApi.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
  })

  it('preserves cursor when loading plugin events', async () => {
    await pluginData.loadPluginEvents('builtin.demo', {
      limit: 50,
      cursor: 'event-2',
    })

    expect(pluginApi.listPluginEvents).toHaveBeenCalledWith('builtin.demo', {
      limit: 50,
      cursor: 'event-2',
    })
  })
})
