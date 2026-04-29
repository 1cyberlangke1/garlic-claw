import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SubagentView from '@/features/subagents/views/SubagentView.vue'
import SubagentViewSource from '@/features/subagents/views/SubagentView.vue?raw'

const removeSubagentSession = vi.fn()

vi.mock('@/features/subagents/composables/use-subagents', () => ({
  useSubagents: () => ({
    loading: ref(false),
    error: ref(null),
    detailLoading: ref(false),
    detailError: ref(null),
    subagents: shallowRef([
      {
        description: '继续已有后台子代理',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        visibility: 'inline',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        writeBackTarget: {
          type: 'conversation',
          id: 'conversation-1',
        },
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
      },
    ]),
    conversationWorkspaces: computed(() => [
      {
        id: 'conversation-1',
        label: 'conversation-1',
        newestRequestedAt: '2026-03-30T12:00:00.000Z',
        subagents: [
          {
            description: '继续已有后台子代理',
            sessionId: 'subagent-session-1',
            sessionMessageCount: 3,
            sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
            visibility: 'inline',
            pluginId: 'internal.subagent',
            pluginDisplayName: '后台子代理',
            subagentType: 'explore',
            subagentTypeName: '探索',
            runtimeKind: 'local',
            status: 'running',
            requestPreview: '请帮我总结当前对话',
            providerId: 'openai',
            modelId: 'gpt-5.2',
            writeBackStatus: 'pending',
            writeBackTarget: {
              type: 'conversation',
              id: 'conversation-1',
            },
            requestedAt: '2026-03-30T12:00:00.000Z',
            startedAt: '2026-03-30T12:00:01.000Z',
            finishedAt: null,
            conversationId: 'conversation-1',
          },
        ],
        windows: [
          {
            id: 'main',
            kind: 'main',
            label: 'main',
          },
          {
            id: 'subagent-session-1',
            kind: 'subagent',
            label: 'agent1',
            sessionId: 'subagent-session-1',
            status: 'running',
            summary: {
              description: '继续已有后台子代理',
              sessionId: 'subagent-session-1',
              sessionMessageCount: 3,
              sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
              visibility: 'inline',
              pluginId: 'internal.subagent',
              pluginDisplayName: '后台子代理',
              subagentType: 'explore',
              subagentTypeName: '探索',
              runtimeKind: 'local',
              status: 'running',
              requestPreview: '请帮我总结当前对话',
              providerId: 'openai',
              modelId: 'gpt-5.2',
              writeBackStatus: 'pending',
              writeBackTarget: {
                type: 'conversation',
                id: 'conversation-1',
              },
              requestedAt: '2026-03-30T12:00:00.000Z',
              startedAt: '2026-03-30T12:00:01.000Z',
              finishedAt: null,
              conversationId: 'conversation-1',
            },
          },
          {
            id: 'subagent-session-2',
            kind: 'subagent',
            label: 'agent2',
            sessionId: 'subagent-session-2',
            status: 'completed',
            summary: {
              description: '第二个后台子代理',
              sessionId: 'subagent-session-2',
              sessionMessageCount: 2,
              sessionUpdatedAt: '2026-03-30T12:10:05.000Z',
              visibility: 'background',
              pluginId: 'internal.subagent',
              pluginDisplayName: '后台子代理',
              runtimeKind: 'local',
              status: 'completed',
              requestPreview: '继续第二个任务',
              providerId: 'openai',
              modelId: 'gpt-5.2',
              writeBackStatus: 'sent',
              requestedAt: '2026-03-30T12:10:00.000Z',
              startedAt: '2026-03-30T12:10:01.000Z',
              finishedAt: '2026-03-30T12:10:05.000Z',
              conversationId: 'conversation-1',
            },
          },
        ],
      },
    ]),
    activeConversationId: ref('conversation-1'),
    activeConversationSubagents: computed(() => [
      {
        description: '继续已有后台子代理',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        visibility: 'inline',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        writeBackTarget: {
          type: 'conversation',
          id: 'conversation-1',
        },
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
      },
    ]),
    activeWindowId: ref('subagent-session-1'),
    activeWindow: computed(() => ({
      id: 'subagent-session-1',
      kind: 'subagent',
      label: 'agent1',
      sessionId: 'subagent-session-1',
      status: 'running',
      summary: {
        description: '继续已有后台子代理',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        visibility: 'inline',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        writeBackTarget: {
          type: 'conversation',
          id: 'conversation-1',
        },
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
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
        id: 'subagent-session-1',
        kind: 'subagent',
        label: 'agent1',
        sessionId: 'subagent-session-1',
        status: 'running',
        summary: {
          description: '继续已有后台子代理',
          sessionId: 'subagent-session-1',
          sessionMessageCount: 3,
          sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
          visibility: 'inline',
          pluginId: 'internal.subagent',
          pluginDisplayName: '后台子代理',
          subagentType: 'explore',
          subagentTypeName: '探索',
          runtimeKind: 'local',
          status: 'running',
          requestPreview: '请帮我总结当前对话',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          writeBackStatus: 'pending',
          writeBackTarget: {
            type: 'conversation',
            id: 'conversation-1',
          },
          requestedAt: '2026-03-30T12:00:00.000Z',
          startedAt: '2026-03-30T12:00:01.000Z',
          finishedAt: null,
          conversationId: 'conversation-1',
        },
      },
      {
        id: 'subagent-session-2',
        kind: 'subagent',
        label: 'agent2',
        sessionId: 'subagent-session-2',
        status: 'completed',
        summary: {
          description: '第二个后台子代理',
          sessionId: 'subagent-session-2',
          sessionMessageCount: 2,
          sessionUpdatedAt: '2026-03-30T12:10:05.000Z',
          visibility: 'background',
          pluginId: 'internal.subagent',
          pluginDisplayName: '后台子代理',
          runtimeKind: 'local',
          status: 'completed',
          requestPreview: '继续第二个任务',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          writeBackStatus: 'sent',
          requestedAt: '2026-03-30T12:10:00.000Z',
          startedAt: '2026-03-30T12:10:01.000Z',
          finishedAt: '2026-03-30T12:10:05.000Z',
          conversationId: 'conversation-1',
        },
      },
    ]),
    activeSubagentDetail: shallowRef({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
      },
      pluginId: 'internal.subagent',
      pluginDisplayName: '后台子代理',
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
      requestPreview: '请帮我总结当前对话',
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
      runtimeKind: 'local',
      sessionId: 'subagent-session-1',
      sessionMessageCount: 3,
      sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
      visibility: 'inline',
      startedAt: '2026-03-30T12:00:01.000Z',
      status: 'running',
      requestedAt: '2026-03-30T12:00:00.000Z',
      writeBackStatus: 'pending',
      finishedAt: null,
    }),
    removingSessionId: ref(null),
    searchKeyword: ref(''),
    filter: ref('all'),
    pagedSubagents: computed(() => [
      {
        description: '继续已有后台子代理',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        visibility: 'inline',
        pluginId: 'internal.subagent',
        pluginDisplayName: '后台子代理',
        subagentType: 'explore',
        subagentTypeName: '探索',
        runtimeKind: 'local',
        status: 'running',
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending',
        writeBackTarget: {
          type: 'conversation',
          id: 'conversation-1',
        },
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
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
    writeBackAttentionCount: computed(() => 1),
    subagentCount: computed(() => 1),
    selectConversation: vi.fn(),
    selectWindow: vi.fn(),
    refreshAll: vi.fn(),
    removeSubagentSession,
  }),
}))

describe('SubagentView', () => {
  it('renders workspace tabs, subagent context and tool management link', () => {
    removeSubagentSession.mockReset()
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
    expect(wrapper.text()).toContain('agent2')
    expect(wrapper.text()).toContain('继续已有后台子代理')
    expect(wrapper.text()).toContain('后台子代理')
    expect(wrapper.text()).toContain('探索')
    expect(wrapper.text()).toContain('请帮我总结当前对话')
    expect(wrapper.text()).toContain('上下文消息')
    expect(wrapper.text()).toContain('这是后台子代理总结')
    expect(wrapper.text()).toContain('会话 3 条')
    expect(wrapper.text()).toContain('同步')
    expect(wrapper.text()).toContain('回写等待中')
    expect(wrapper.text()).toContain('查看上下文')
    expect(wrapper.text()).toContain('打开工具管理')
    expect(wrapper.text()).toContain('移除')
    expect(wrapper.get('[data-test="window-strip"]').classes()).toContain('window-strip')
    expect(SubagentViewSource).toContain('.window-strip')
    expect(SubagentViewSource).toContain('overflow-x: auto;')

    wrapper.get('[data-test="remove-subagent-button"]').trigger('click')
    expect(removeSubagentSession).toHaveBeenCalledWith('subagent-session-1')
  })
})
