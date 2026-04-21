import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatRuntimePermissionPanel from '@/features/chat/components/ChatRuntimePermissionPanel.vue'

describe('ChatRuntimePermissionPanel', () => {
  it('renders pending runtime requests and emits reply decisions', async () => {
    const wrapper = mount(ChatRuntimePermissionPanel, {
      props: {
        requests: [
          {
            id: 'permission-1',
            conversationId: 'conversation-1',
            backendKind: 'just-bash',
            toolName: 'bash',
            capabilities: ['shellExecution', 'networkAccess'],
            createdAt: '2026-04-20T09:00:00.000Z',
            summary: '执行 curl 请求',
            metadata: {
              command: 'curl https://example.com',
            },
            resolving: false,
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('运行时权限审批')
    expect(wrapper.text()).toContain('bash')
    expect(wrapper.text()).toContain('执行 Shell')
    expect(wrapper.text()).toContain('访问网络')
    expect(wrapper.text()).toContain('curl https://example.com')

    await wrapper.findAll('button')[1]?.trigger('click')

    expect(wrapper.emitted('reply')).toEqual([
      ['permission-1', 'always'],
    ])
  })
})
