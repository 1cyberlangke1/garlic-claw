import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/tools/api/mcp', () => ({
  listMcpServerEvents: vi.fn(),
}))

describe('mcp-config-management.data', async () => {
  const mcpApi = await import('@/features/tools/api/mcp')
  const mcpData = await import('@/features/tools/composables/mcp-config-management.data')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mcpApi.listMcpServerEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
  })

  it('preserves cursor when loading MCP events', async () => {
    await mcpData.loadMcpServerEvents('weather-server', {
      limit: 50,
      cursor: 'event-2',
    })

    expect(mcpApi.listMcpServerEvents).toHaveBeenCalledWith('weather-server', {
      limit: 50,
      cursor: 'event-2',
    })
  })
})
