import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginEventLog from './PluginEventLog.vue'

describe('PluginEventLog', () => {
  it('emits refresh with the selected limit', async () => {
    const wrapper = mount(PluginEventLog, {
      props: {
        events: [],
        loading: false,
        limit: 50,
      },
    })

    await wrapper.get('[data-test="event-limit"]').setValue('100')
    expect(wrapper.emitted('refresh')).toEqual([[100]])

    await wrapper.get('[data-test="event-refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([[100], [100]])
  })

  it('filters events by level and search text', async () => {
    const wrapper = mount(PluginEventLog, {
      props: {
        events: [
          {
            id: 'event-1',
            type: 'plugin:config',
            level: 'warn',
            message: '缺少 limit 配置，已回退默认值',
            metadata: {
              field: 'limit',
            },
            createdAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'event-2',
            type: 'tool:timeout',
            level: 'error',
            message: 'memory.search timeout',
            metadata: {
              toolName: 'memory.search',
            },
            createdAt: '2026-03-28T00:01:00.000Z',
          },
        ],
        loading: false,
        limit: 50,
      },
    })

    await wrapper.get('[data-test="event-level-filter"]').setValue('error')
    expect(wrapper.text()).toContain('tool:timeout')
    expect(wrapper.text()).not.toContain('plugin:config')

    await wrapper.get('[data-test="event-search-filter"]').setValue('memory.search')
    expect(wrapper.text()).toContain('memory.search timeout')
    expect(wrapper.text()).not.toContain('缺少 limit 配置')
  })
})
