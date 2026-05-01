import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as internalConfigChange from '@/features/ai-settings/internal-config-change'
import { useMcpConfigManagement } from '@/features/tools/composables/use-mcp-config-management'
import * as mcpData from '@/features/tools/composables/mcp-config-management.data'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return {
    promise,
    resolve,
  }
}

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
    const emitSpy = vi.spyOn(internalConfigChange, 'emitInternalConfigChanged')
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
    expect(emitSpy).toHaveBeenCalledTimes(3)
    expect(emitSpy).toHaveBeenNthCalledWith(1, { scope: 'mcp' })
    expect(emitSpy).toHaveBeenNthCalledWith(2, { scope: 'mcp' })
    expect(emitSpy).toHaveBeenNthCalledWith(3, { scope: 'mcp' })
  })

  it('still emits the MCP config change event when create succeeds but refresh fails', async () => {
    const emitSpy = vi.spyOn(internalConfigChange, 'emitInternalConfigChanged')
    vi.mocked(mcpData.loadMcpConfigSnapshot)
      .mockResolvedValueOnce({
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
      .mockRejectedValueOnce(new Error('refresh failed'))

    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    await expect(state.createServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })).resolves.toEqual({
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

    expect(emitSpy).toHaveBeenCalledWith({ scope: 'mcp' })
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

  it('ignores stale MCP event responses after switching servers and resets the event query', async () => {
    vi.mocked(mcpData.normalizeMcpEventQuery).mockImplementation((query) => ({
      limit: query.limit ?? 50,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    }))
    let resolveWeather!: (value: {
      items: Array<{
        id: string
        type: string
        level: 'error' | 'info' | 'warn'
        message: string
        metadata: null
        createdAt: string
      }>
      nextCursor: string | null
    }) => void
    const weatherEvents = new Promise<{
      items: Array<{
        id: string
        type: string
        level: 'error' | 'info' | 'warn'
        message: string
        metadata: null
        createdAt: string
      }>
      nextCursor: string | null
    }>((resolve) => {
      resolveWeather = resolve
    })

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
        {
          name: 'search-server',
          command: 'npx',
          args: ['-y', '@mariox/search-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    })
    vi.mocked(mcpData.loadMcpServerEvents)
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
      })
      .mockImplementation((serverName) => {
        if (serverName === 'weather-server') {
          return weatherEvents
        }
        return Promise.resolve({
          items: [
            {
              id: 'search-1',
              type: 'mcp:info',
              level: 'info',
              message: 'search current',
              metadata: null,
              createdAt: '2026-04-21T00:00:11.000Z',
            },
          ],
          nextCursor: null,
        })
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
    vi.clearAllMocks()

    state.eventQuery.value = {
      limit: 50,
      keyword: 'weather-only',
    }
    void state.refreshServerEvents(undefined, 'weather-server')
    state.selectServer('search-server')

    resolveWeather({
      items: [
        {
          id: 'weather-1',
          type: 'mcp:error',
          level: 'error',
          message: 'weather stale',
          metadata: null,
          createdAt: '2026-04-21T00:00:10.000Z',
        },
      ],
      nextCursor: 'weather-1',
    })
    await flushPromises()

    expect(state.selectedServerName.value).toBe('search-server')
    expect(state.eventQuery.value).toEqual({ limit: 50 })
    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['search-1'])
    expect(state.eventNextCursor.value).toBeNull()
    expect(mcpData.loadMcpServerEvents).toHaveBeenNthCalledWith(1, 'weather-server', {
      keyword: 'weather-only',
      limit: 50,
    })
    expect(mcpData.loadMcpServerEvents).toHaveBeenNthCalledWith(2, 'search-server', {
      limit: 50,
    })
  })

  it('keeps the latest MCP snapshot when an older refresh resolves later', async () => {
    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    vi.clearAllMocks()
    const firstRefresh = createDeferred<{
      configPath: string
      servers: Array<{
        name: string
        command: string
        args: string[]
        env: Record<string, string>
        eventLog: {
          maxFileSizeMb: number
        }
      }>
    }>()
    vi.mocked(mcpData.loadMcpConfigSnapshot)
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockResolvedValueOnce({
        configPath: 'mcp/servers',
        servers: [
          {
            name: 'search-server',
            command: 'npx',
            args: ['-y', '@mariox/search-mcp-server'],
            env: {},
            eventLog: {
              maxFileSizeMb: 1,
            },
          },
        ],
      })

    const firstPromise = state.refresh('weather-server')
    const secondPromise = state.refresh('search-server')
    await secondPromise

    expect(state.selectedServer.value?.name).toBe('search-server')
    expect(state.servers.value.map((server) => server.name)).toEqual(['search-server'])

    firstRefresh.resolve({
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
    await firstPromise
    await flushPromises()

    expect(state.selectedServer.value?.name).toBe('search-server')
    expect(state.servers.value.map((server) => server.name)).toEqual(['search-server'])
  })
})
