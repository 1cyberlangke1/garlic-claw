import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatComposer from '@/features/chat/components/ChatComposer.vue'

describe('ChatComposer', () => {
  it('shows the manual compaction command in the input placeholder', () => {
    const wrapper = mount(ChatComposer, {
      props: {
        modelValue: '',
        pendingImages: [],
        uploadNotices: [],
        canSend: true,
        streaming: false,
      },
    })

    expect(wrapper.find('textarea').attributes('placeholder')).toContain('/compact')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('/compress')
  })
})
