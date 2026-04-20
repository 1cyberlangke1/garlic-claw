import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatComposer from '@/features/chat/components/ChatComposer.vue'

describe('ChatComposer', () => {
  it('shows a generic command hint instead of hard-coded compaction commands', () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '',
        pendingImages: [],
        uploadNotices: [],
        commandSuggestions: [],
        canSend: true,
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
            commandId: 'builtin.context-compaction:/compact:command',
            trigger: '/compact',
            canonicalCommand: '/compact',
            pluginId: 'builtin.context-compaction',
            pluginDisplayName: '上下文压缩',
            connected: true,
            defaultEnabled: true,
            kind: 'command',
          },
          {
            commandId: 'builtin.context-compaction:/compress:command',
            trigger: '/compress',
            canonicalCommand: '/compact',
            pluginId: 'builtin.context-compaction',
            pluginDisplayName: '上下文压缩',
            connected: true,
            defaultEnabled: true,
            kind: 'command',
          },
        ],
        canSend: true,
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
})
