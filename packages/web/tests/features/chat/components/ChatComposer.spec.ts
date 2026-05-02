import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatComposer from '@/modules/chat/components/ChatComposer.vue'

describe('ChatComposer', () => {
  it('shows a generic command hint instead of hard-coded compaction commands', () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '',
        pendingImages: [],
        uploadNotices: [],
        commandSuggestions: [],
        queuedSendCount: 0,
        queuedSendPreviewEntries: [],
        canSend: true,
        canStop: false,
        streaming: false,
      },
    })

    expect(wrapper.find('textarea').attributes('placeholder')).toContain('输入 / 查看命令提示')
    expect(wrapper.find('textarea').attributes('placeholder')).not.toContain('/compact')
    expect(wrapper.find('textarea').attributes('placeholder')).not.toContain('/compress')
  })

  it('renders command suggestions and applies the highlighted command on enter', async () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '/',
        pendingImages: [],
        uploadNotices: [],
        commandSuggestions: [
          {
            commandId: 'internal.context-governance:/compact:command',
            trigger: '/compact',
            canonicalCommand: '/compact',
            pluginId: 'internal.context-governance',
            pluginDisplayName: '上下文压缩',
            connected: true,
            defaultEnabled: true,
            kind: 'command',
          },
          {
            commandId: 'internal.context-governance:/compress:command',
            trigger: '/compress',
            canonicalCommand: '/compact',
            pluginId: 'internal.context-governance',
            pluginDisplayName: '上下文压缩',
            connected: true,
            defaultEnabled: true,
            kind: 'command',
          },
        ],
        queuedSendCount: 0,
        queuedSendPreviewEntries: [],
        canSend: true,
        canStop: false,
        streaming: false,
      },
    })

    const textarea = wrapper.find('textarea')
    await textarea.trigger('focus')

    expect(wrapper.findAll('.command-suggestion-item')).toHaveLength(2)

    await textarea.trigger('keydown', { key: 'ArrowDown' })
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('apply-command-suggestion')).toEqual([[ '/compress' ]])
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('renders queued send previews and pops the queue tail on Alt+ArrowUp', async () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '当前草稿',
        pendingImages: [],
        uploadNotices: [],
        commandSuggestions: [],
        queuedSendCount: 2,
        queuedSendPreviewEntries: [
          { id: 'queued-2', preview: '第二条待发送' },
          { id: 'queued-1', preview: '第一条待发送' },
        ],
        canSend: true,
        canStop: false,
        streaming: true,
      },
    })

    expect(wrapper.text()).toContain('待发送队列')
    expect(wrapper.text()).toContain('第二条待发送')
    expect(wrapper.text()).toContain('按 Alt+↑ 取回最后一条到输入框')

    await wrapper.find('textarea').trigger('keydown', { key: 'ArrowUp', altKey: true })

    expect(wrapper.emitted('pop-queued-send')).toEqual([[]])
  })

  it('disables stop when the current blocking message is not actually stoppable', () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '',
        pendingImages: [],
        uploadNotices: [],
        commandSuggestions: [],
        queuedSendCount: 0,
        queuedSendPreviewEntries: [],
        canSend: true,
        canStop: false,
        streaming: true,
      },
    })

    expect(wrapper.find('.stop-button').attributes('disabled')).toBeDefined()
  })
})
