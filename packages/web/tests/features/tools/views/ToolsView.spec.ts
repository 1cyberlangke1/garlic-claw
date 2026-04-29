import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ToolsView from '@/features/tools/views/ToolsView.vue'

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

describe('ToolsView', () => {
  it('renders the unified tool management sections and forwards focused source ids', () => {
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

    expect(wrapper.text()).toContain('工具管理')
    expect(wrapper.text()).toContain('执行工具管理|internal|runtime-tools')
    expect(wrapper.text()).toContain('子代理工具管理|internal|subagent')
    expect(wrapper.text()).toContain('MCP 工具管理|mcp|all')
    expect(wrapper.text()).toContain('插件工具管理|plugin|builtin.demo')
  })
})
