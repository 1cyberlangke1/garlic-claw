import { computed, ref, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import McpConfigPanel from '@/modules/tools/components/McpConfigPanel.vue'

const hoisted = vi.hoisted(() => ({
  state: null as ReturnType<typeof createManagementState> | null,
}))

vi.mock('@/modules/tools/composables/use-mcp-config-management', () => ({
  useMcpConfigManagement: () => hoisted.state,
}))

describe('McpConfigPanel', () => {
  it('renders MCP config summary and selected server fields', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
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
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'weather-server',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('MCP 配置')
    expect(wrapper.text()).not.toContain('MCP Config')
    expect(wrapper.text()).toContain('mcp/servers')
    expect(wrapper.text()).toContain('weather-server')
    expect(wrapper.find('[data-test="mcp-name-input"]').element).toHaveProperty('value', 'weather-server')
    expect(wrapper.find('[data-test="mcp-command-input"]').element).toHaveProperty('value', 'npx')
    expect(wrapper.text()).toContain('MCP 日志设置')
    expect(wrapper.text()).not.toContain('MCP 事件日志')
  })

  it('submits create requests with command args and env entries', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [],
    }

    const wrapper = mount(McpConfigPanel)

    await wrapper.get('[data-test="mcp-new-button"]').trigger('click')
    await wrapper.get('[data-test="mcp-name-input"]').setValue('tavily')
    await wrapper.get('[data-test="mcp-command-input"]').setValue('npx')
    await wrapper.get('[data-test="mcp-args-input"]').setValue('-y\ntavily-mcp@latest')
    await wrapper.get('[data-test="mcp-env-key-0"]').setValue('TAVILY_API_KEY')
    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('${TAVILY_API_KEY}')
    await wrapper.get('form').trigger('submit')

    expect(hoisted.state?.createServer).toHaveBeenCalledWith({
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
  })

  it('saves event log settings for the selected server', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
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
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel)
    await flushPromises()

    await wrapper.get('input[type="number"]').setValue('2')
    await wrapper.get('.mcp-detail-panels .action-row .el-button--primary').trigger('click')

    expect(hoisted.state?.saveServerEventLog).toHaveBeenCalledWith({
      maxFileSizeMb: 2,
    })
  })

  it('renders event logs in logs view without config editor', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
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
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel, {
      props: {
        view: 'logs',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('MCP 事件日志')
    expect(wrapper.text()).not.toContain('MCP Logs')
    expect(wrapper.find('[data-test="mcp-name-input"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('MCP 日志设置')
  })
})

function createManagementState() {
  const snapshot = ref({
    configPath: 'mcp/servers',
    servers: [] as Array<{
      name: string
      command: string
      args: string[]
      env: Record<string, string>
      eventLog: {
        maxFileSizeMb: number
      }
    }>,
  })
  const selectedServerName = ref<string | null>(null)
  const servers = computed(() => snapshot.value.servers)

  return {
    loading: ref(false),
    saving: ref(false),
    savingEventLog: ref(false),
    deleting: ref(false),
    error: ref<string | null>(null),
    notice: ref<string | null>(null),
    snapshot,
    servers,
    selectedServerName,
    eventLoading: ref(false),
    eventLogs: shallowRef([]),
    eventQuery: shallowRef({ limit: 50 }),
    eventNextCursor: ref<string | null>(null),
    selectedServer: computed(() =>
      servers.value.find((server) => server.name === selectedServerName.value) ?? null,
    ),
    refresh: vi.fn(),
    refreshServerEvents: vi.fn(),
    loadMoreServerEvents: vi.fn(),
    selectServer: vi.fn((name: string | null) => {
      selectedServerName.value = name
    }),
    createServer: vi.fn().mockResolvedValue(undefined),
    updateServer: vi.fn().mockResolvedValue(undefined),
    deleteServer: vi.fn().mockResolvedValue(undefined),
    saveServerEventLog: vi.fn().mockResolvedValue(undefined),
  }
}
