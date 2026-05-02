import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import McpView from '@/modules/mcp/views/McpView.vue'

describe('McpView', () => {
  it('renders mcp side navigation and passes the current view into config panel', async () => {
    const wrapper = mount(McpView, {
      global: {
        stubs: {
          McpConfigPanel: {
            props: ['view'],
            template: '<div class="mcp-config-stub">{{ view }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('MCP 管理')
    expect(wrapper.text()).toContain('MCP 配置')
    expect(wrapper.text()).toContain('事件日志')
    expect(wrapper.text()).toContain('manage')
    expect(wrapper.find('button[title="刷新配置"]').exists()).toBe(true)
    expect(wrapper.find('button[title="新增 Server"]').exists()).toBe(true)

    await wrapper.get('button[title="事件日志"]').trigger('click')

    expect(wrapper.text()).toContain('logs')
    expect(wrapper.find('button[title="刷新日志"]').exists()).toBe(true)
    expect(wrapper.find('button[title="新增 Server"]').exists()).toBe(false)
  })
})
