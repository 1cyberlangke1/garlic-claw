import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import McpView from '@/modules/mcp/views/McpView.vue'

describe('McpView', () => {
  it('renders mcp header switch and passes the current view into config panel', async () => {
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
    expect(wrapper.text()).toContain('管理')
    expect(wrapper.text()).toContain('日志')
    expect(wrapper.text()).toContain('manage')

    await wrapper.get('button[title="日志"]').trigger('click')

    expect(wrapper.text()).toContain('MCP 日志')
    expect(wrapper.text()).toContain('logs')
  })
})
