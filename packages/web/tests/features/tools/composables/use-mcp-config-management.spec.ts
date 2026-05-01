import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMcpConfigManagement } from '@/features/tools/composables/use-mcp-config-management'
import * as mcpData from '@/features/tools/composables/mcp-config-management.data'

vi.mock('@/features/tools/composables/mcp-config-management.data', () => ({
  loadMcpConfigSnapshot: vi.fn(),
  createMcpServerConfig: vi.fn(),
  updateMcpServerConfig: vi.fn(),
  deleteMcpServerConfig: vi.fn(),
  loadMcpServerEvents: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  normalizeMcpEventQuery: vi.fn((query) => ({
    limit: query.limit ?? 50,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })),
  dedupeMcpEventLogs: vi.fn((items) => items),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('useMcpConfigManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mcpData.loadMcpConfigSnapshot).mockResolvedValue({
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    })
    vi.mocked(mcpData.createMcpServerConfig).mockResolvedValue({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    vi.mocked(mcpData.updateMcpServerConfig).mockResolvedValue({
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    vi.mocked(mcpData.deleteMcpServerConfig).mockResolvedValue({
      deleted: true,
      name: 'weather-server',
    })
  })

  it('loads MCP config snapshot and tracks selected server', async () => {
    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.snapshot.value.configPath).toBe('mcp/servers')
    expect(state.servers.value).toHaveLength(1)
    expect(state.selectedServer.value?.name).toBe('weather-server')

    state.selectServer('missing-server')
    await flushPromises()

    expect(state.selectedServer.value).toBeNull()
  })

  it('creates, updates, and deletes MCP servers through the API layer', async () => {
    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    await state.createServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    await state.updateServer('weather-server', {
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    await state.deleteServer('weather-server')

    expect(mcpData.createMcpServerConfig).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    expect(mcpData.updateMcpServerConfig).toHaveBeenCalledWith('weather-server', {
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    expect(mcpData.deleteMcpServerConfig).toHaveBeenCalledWith('weather-server')
  })

  it('loads more MCP events with nextCursor and appends the next page', async () => {
    vi.mocked(mcpData.loadMcpServerEvents)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-3',
            type: 'mcp:error',
            level: 'error',
            message: 'third',
            metadata: null,
            createdAt: '2026-04-21T00:00:03.000Z',
          },
          {
            id: 'event-2',
            type: 'mcp:warn',
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
            type: 'mcp:info',
            level: 'info',
            message: 'first',
            metadata: null,
            createdAt: '2026-04-21T00:00:01.000Z',
          },
        ],
        nextCursor: null,
      })

    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2'])
    expect(state.eventNextCursor.value).toBe('event-2')

    await state.loadMoreServerEvents()
    await flushPromises()

    expect(mcpData.loadMcpServerEvents).toHaveBeenNthCalledWith(2, 'weather-server', {
      limit: 50,
      cursor: 'event-2',
    })
    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2', 'event-1'])
    expect(state.eventNextCursor.value).toBeNull()
    expect(state.eventQuery.value).toEqual({ limit: 50 })
  })

  it('does not reuse pagination cursor for a later normal refresh', async () => {
    vi.mocked(mcpData.loadMcpServerEvents)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-3',
            type: 'mcp:error',
            level: 'error',
            message: 'third',
            metadata: null,
            createdAt: '2026-04-21T00:00:03.000Z',
          },
        ],
        nextCursor: 'event-3',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-2',
            type: 'mcp:warn',
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
            id: 'event-9',
            type: 'mcp:info',
            level: 'info',
            message: 'refreshed',
            metadata: null,
            createdAt: '2026-04-21T00:00:09.000Z',
          },
        ],
        nextCursor: null,
      })

    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    await state.loadMoreServerEvents()
    await state.refreshServerEvents()
    await flushPromises()

    expect(mcpData.loadMcpServerEvents).toHaveBeenNthCalledWith(3, 'weather-server', {
      limit: 50,
    })
    expect(state.eventQuery.value).toEqual({ limit: 50 })
  })
})
