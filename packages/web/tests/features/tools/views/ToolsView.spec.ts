import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERNAL_CONFIG_CHANGED_EVENT } from '@/features/ai-settings/internal-config-change'
import ToolsView from '@/features/tools/views/ToolsView.vue'
import * as toolData from '@/features/tools/composables/tool-management.data'

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => ({
      query: {
        kind: 'plugin',
        source: 'builtin.demo',
      },
    }),
  }
})

vi.mock('@/features/tools/composables/tool-management.data', () => ({
  loadToolOverview: vi.fn(),
}))

describe('ToolsView', () => {
  beforeEach(() => {
    vi.mocked(toolData.loadToolOverview).mockResolvedValue({
      sources: [
        {
          kind: 'internal',
          id: 'runtime-tools',
          label: '执行工具',
          enabled: true,
          totalTools: 2,
          enabledTools: 2,
        },
        {
          kind: 'internal',
          id: 'subagent',
          label: '子代理工具',
          enabled: true,
          totalTools: 1,
          enabledTools: 1,
        },
        {
          kind: 'plugin',
          id: 'builtin.demo',
          label: 'Demo Plugin',
          enabled: true,
          totalTools: 3,
          enabledTools: 3,
        },
      ],
      tools: [],
    })
  })

  it('renders only sections that have actual tool sources and forwards focused source ids', async () => {
    const wrapper = mount(ToolsView, {
      global: {
        stubs: {
          ToolGovernancePanel: {
            props: ['sourceKind', 'sourceId', 'title'],
            template: '<div>{{ title }}|{{ sourceKind }}|{{ sourceId || "all" }}</div>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('工具管理')
    expect(wrapper.text()).toContain('执行工具管理|internal|runtime-tools')
    expect(wrapper.text()).toContain('子代理工具管理|internal|subagent')
    expect(wrapper.text()).toContain('插件工具管理|plugin|builtin.demo')
    expect(wrapper.text()).not.toContain('MCP 工具管理|mcp|all')
    wrapper.unmount()
  })

  it('shows an empty hint when no actual tool source exists', async () => {
    vi.mocked(toolData.loadToolOverview).mockResolvedValueOnce({
      sources: [
        {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: false,
          totalTools: 0,
          enabledTools: 0,
        },
      ],
      tools: [],
    })

    const wrapper = mount(ToolsView, {
      global: {
        stubs: {
          ToolGovernancePanel: {
            props: ['sourceKind', 'sourceId', 'title'],
            template: '<div>{{ title }}|{{ sourceKind }}|{{ sourceId || "all" }}</div>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('当前还没有可管理的实际工具')
    expect(wrapper.text()).not.toContain('执行工具管理|internal|runtime-tools')
    expect(wrapper.text()).not.toContain('子代理工具管理|internal|subagent')
    expect(wrapper.text()).not.toContain('MCP 工具管理|mcp|all')
    expect(wrapper.text()).not.toContain('插件工具管理|plugin|builtin.demo')
    wrapper.unmount()
  })

  it('refreshes overview when runtime tool config changes', async () => {
    const wrapper = mount(ToolsView, {
      global: {
        stubs: {
          ToolGovernancePanel: {
            props: ['sourceKind', 'sourceId', 'title'],
            template: '<div>{{ title }}|{{ sourceKind }}|{{ sourceId || "all" }}</div>',
          },
        },
      },
    })
    await flushPromises()
    const callCountBeforeEvent = vi.mocked(toolData.loadToolOverview).mock.calls.length

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'runtime-tools',
      },
    }))
    await flushPromises()

    expect(vi.mocked(toolData.loadToolOverview).mock.calls.length).toBeGreaterThan(callCountBeforeEvent)
    wrapper.unmount()
  })
})
