import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SubagentView from '@/features/subagents/views/SubagentView.vue'

const closeSubagentConversation = vi.fn()
const selectConversation = vi.fn()
const selectWindow = vi.fn()

vi.mock('@/features/subagents/composables/use-subagents', () => ({
  useSubagents: () => ({
    loading: ref(false),
    error: ref(null),
    detailLoading: ref(false),
    detailError: ref(null),
    subagents: shallowRef([
      {
        conversationId: 'subagent-conversation-1',
        parentConversationId: 'conversation-1',
        title: 'agent1',
        messageCount: 3,
        updatedAt: '2026-03-30T12:00:05.000Z',
        description: '继续已有后台子代理',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
    ]),
    conversationWorkspaces: computed(() => [
      {
        id: 'conversation-1',
        label: 'conversation-1',
        newestRequestedAt: '2026-03-30T12:00:00.000Z',
        subagents: [
          {
            conversationId: 'subagent-conversation-1',
            parentConversationId: 'conversation-1',
            title: 'agent1',
            messageCount: 3,
            updatedAt: '2026-03-30T12:00:05.000Z',
            description: '继续已有后台子代理',
            pluginId: 'internal.subagent',
            pluginDisplayName: '后台子代理',
            subagentType: 'explore',
            subagentTypeName: '探索',
            runtimeKind: 'local',
            status: 'running',
            requestPreview: '请帮我总结当前对话',
            providerId: 'openai',
            modelId: 'gpt-5.2',
            requestedAt: '2026-03-30T12:00:00.000Z',
            startedAt: '2026-03-30T12:00:01.000Z',
            finishedAt: null,
            closedAt: null,
          },
        ],
        windows: [
          {
            id: 'main',
            kind: 'main',
            label: 'main',
          },
          {
            id: 'subagent-conversation-1',
            kind: 'subagent',
            label: 'agent1',
            conversationId: 'subagent-conversation-1',
            status: 'running',
            summary: {
              conversationId: 'subagent-conversation-1',
              parentConversationId: 'conversation-1',
              title: 'agent1',
              messageCount: 3,
              updatedAt: '2026-03-30T12:00:05.000Z',
              description: '继续已有后台子代理',
              pluginId: 'internal.subagent',
              pluginDisplayName: '后台子代理',
              subagentType: 'explore',
              subagentTypeName: '探索',
              runtimeKind: 'local',
              status: 'running',
              requestPreview: '请帮我总结当前对话',
              providerId: 'openai',
              modelId: 'gpt-5.2',
              requestedAt: '2026-03-30T12:00:00.000Z',
              startedAt: '2026-03-30T12:00:01.000Z',
              finishedAt: null,
              closedAt: null,
            },
          },
        ],
      },
    ]),
    activeConversationId: ref('conversation-1'),
    activeConversationSubagents: computed(() => [
      {
        conversationId: 'subagent-conversation-1',
        parentConversationId: 'conversation-1',
        title: 'agent1',
        messageCount: 3,
        updatedAt: '2026-03-30T12:00:05.000Z',
        description: '继续已有后台子代理',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
    ]),
    activeWindowId: ref('subagent-conversation-1'),
    activeWindow: computed(() => ({
      id: 'subagent-conversation-1',
      kind: 'subagent',
      label: 'agent1',
      conversationId: 'subagent-conversation-1',
      status: 'running',
      summary: {
        conversationId: 'subagent-conversation-1',
        parentConversationId: 'conversation-1',
        title: 'agent1',
        messageCount: 3,
        updatedAt: '2026-03-30T12:00:05.000Z',
        description: '继续已有后台子代理',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
    })),
    activeWindowKind: computed(() => 'subagent'),
    activeWorkspaceWindows: computed(() => [
      {
        id: 'main',
        kind: 'main',
        label: 'main',
      },
      {
        id: 'subagent-conversation-1',
        kind: 'subagent',
        label: 'agent1',
        conversationId: 'subagent-conversation-1',
        status: 'running',
        summary: {
          conversationId: 'subagent-conversation-1',
          parentConversationId: 'conversation-1',
          title: 'agent1',
          messageCount: 3,
          updatedAt: '2026-03-30T12:00:05.000Z',
          description: '继续已有后台子代理',
          pluginId: 'internal.subagent',
          pluginDisplayName: '后台子代理',
          subagentType: 'explore',
          subagentTypeName: '探索',
          runtimeKind: 'local',
          status: 'running',
          requestPreview: '请帮我总结当前对话',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          requestedAt: '2026-03-30T12:00:00.000Z',
          startedAt: '2026-03-30T12:00:01.000Z',
          finishedAt: null,
          closedAt: null,
        },
      },
    ]),
    activeSubagentDetail: shallowRef({
      conversationId: 'subagent-conversation-1',
      parentConversationId: 'conversation-1',
      title: 'agent1',
      messageCount: 3,
      updatedAt: '2026-03-30T12:00:05.000Z',
      pluginId: 'internal.subagent',
      pluginDisplayName: '后台子代理',
      runtimeKind: 'local',
      status: 'running',
      requestPreview: '请帮我总结当前对话',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: null,
      closedAt: null,
      request: {
        messages: [
          {
            content: '请帮我总结当前对话',
            role: 'user',
          },
          {
            content: '这是后台子代理总结',
            role: 'assistant',
          },
        ],
        toolNames: ['memory.search'],
      },
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
      },
      result: {
        message: {
          content: '这是后台子代理总结',
          role: 'assistant',
        },
        modelId: 'gpt-5.2',
        providerId: 'openai',
        text: '这是后台子代理总结',
        toolCalls: [],
        toolResults: [],
      },
    }),
    closingConversationId: ref(null),
    searchKeyword: ref(''),
    filter: ref('all'),
    pagedSubagents: computed(() => [
      {
        conversationId: 'subagent-conversation-1',
        parentConversationId: 'conversation-1',
        title: 'agent1',
        messageCount: 3,
        updatedAt: '2026-03-30T12:00:05.000Z',
        description: '继续已有后台子代理',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
    ]),
    page: ref(1),
    pageCount: ref(1),
    rangeStart: ref(1),
    rangeEnd: ref(1),
    canGoPrevPage: ref(false),
    canGoNextPage: ref(false),
    goPrevPage: vi.fn(),
    goNextPage: vi.fn(),
    filteredSubagentCount: computed(() => 1),
    runningSubagentCount: computed(() => 1),
    errorSubagentCount: computed(() => 0),
    subagentCount: computed(() => 1),
    selectConversation,
    selectWindow,
    refreshAll: vi.fn(),
    closeSubagentConversation,
  }),
}))

describe('SubagentView', () => {
  it('renders workspace windows and subagent runtime details', async () => {
    closeSubagentConversation.mockReset()
    selectConversation.mockReset()
    selectWindow.mockReset()

    const wrapper = mount(SubagentView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="typeof to === \'string\' ? to : to.path || to.name"><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Subagent')
    expect(wrapper.text()).toContain('会话窗口')
    expect(wrapper.text()).toContain('main')
    expect(wrapper.text()).toContain('agent1')
    expect(wrapper.text()).toContain('继续已有后台子代理')
    expect(wrapper.text()).toContain('探索')
    expect(wrapper.text()).toContain('消息 3 条')
    expect(wrapper.text()).toContain('上下文消息')
    expect(wrapper.text()).toContain('这是后台子代理总结')
    expect(wrapper.text()).toContain('关闭')
    expect(wrapper.text()).toContain('打开工具管理')

    const openButton = wrapper.findAll('button').find((button) => button.text() === '查看上下文')
    expect(openButton).toBeDefined()
    await openButton!.trigger('click')
    expect(selectConversation).toHaveBeenCalledWith('conversation-1')
    expect(selectWindow).toHaveBeenCalledWith('subagent-conversation-1')

    await wrapper.get('[data-test="remove-subagent-button"]').trigger('click')
    expect(closeSubagentConversation).toHaveBeenCalledWith('subagent-conversation-1')
  })
})
