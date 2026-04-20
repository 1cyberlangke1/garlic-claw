import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SubagentTasksView from '@/features/subagents/views/SubagentTasksView.vue'

vi.mock('@/features/subagents/composables/use-plugin-subagent-tasks', () => ({
  usePluginSubagentTasks: () => ({
    loading: ref(false),
    error: ref(null),
    tasks: shallowRef([
      {
        description: '继续已有后台任务',
        id: 'subagent-task-1',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        pluginId: 'builtin.subagent-delegate',
        pluginDisplayName: '子代理委派',
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
    searchKeyword: ref(''),
    filter: ref('all'),
    pagedTasks: computed(() => [
      {
        description: '继续已有后台任务',
        id: 'subagent-task-1',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        pluginId: 'builtin.subagent-delegate',
        pluginDisplayName: '子代理委派',
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
    taskCount: computed(() => 1),
    filteredTaskCount: computed(() => 1),
    runningTaskCount: computed(() => 1),
    errorTaskCount: computed(() => 0),
    writeBackAttentionCount: computed(() => 1),
    refreshAll: vi.fn(),
  }),
}))

describe('SubagentTasksView', () => {
  it('renders the background subagent task dashboard and plugin deep-links', () => {
    const wrapper = mount(SubagentTasksView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="typeof to === \'string\' ? to : to.path || to.name"><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('后台 Subagent 任务')
    expect(wrapper.text()).toContain('继续已有后台任务')
    expect(wrapper.text()).toContain('子代理委派')
    expect(wrapper.text()).toContain('探索')
    expect(wrapper.text()).toContain('请帮我总结当前对话')
    expect(wrapper.text()).toContain('会话 3 条')
    expect(wrapper.text()).toContain('回写等待中')
    expect(wrapper.text()).toContain('打开插件治理')
  })
})
