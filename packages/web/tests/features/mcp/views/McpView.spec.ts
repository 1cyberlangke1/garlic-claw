import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import McpView from '@/modules/mcp/views/McpView.vue'

describe('McpView', () => {
  it('renders mcp workspace with config section and unified management entry', () => {
    const wrapper = mount(McpView, {
      global: {
        stubs: {
          McpConfigPanel: { template: '<div>mcp-config</div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('MCP 管理')
    expect(wrapper.text()).toContain('工具启用/禁用统一在工具管理页')
    expect(wrapper.text()).toContain('打开工具管理')
    expect(wrapper.text()).toContain('mcp-config')
  })
})
