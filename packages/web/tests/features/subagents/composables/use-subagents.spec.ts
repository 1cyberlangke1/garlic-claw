import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubagents } from '@/features/subagents/composables/use-subagents'
import * as subagentData from '@/features/subagents/composables/subagents.data'

vi.mock('@/features/subagents/composables/subagents.data', () => ({
  closePluginSubagentConversation: vi.fn(),
  loadPluginSubagentDetail: vi.fn(),
  loadPluginSubagentOverview: vi.fn(),
}))

function createOverview() {
  return {
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
        runtimeKind: 'local' as const,
        status: 'running' as const,
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
      {
        conversationId: 'subagent-conversation-2',
        title: 'agent2',
        messageCount: 4,
        updatedAt: '2026-03-30T11:50:05.000Z',
        description: '分析失败插件',
        pluginId: 'remote.ops-helper',
        pluginDisplayName: '运维助手',
        runtimeKind: 'remote' as const,
        status: 'completed' as const,
        requestPreview: '请分析最近失败的插件',
        resultPreview: '这是后台子代理总结',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        requestedAt: '2026-03-30T11:50:00.000Z',
        startedAt: '2026-03-30T11:50:01.000Z',
        finishedAt: '2026-03-30T11:50:05.000Z',
        closedAt: null,
      },
    ],
  }
}

describe('useSubagents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(subagentData.loadPluginSubagentOverview).mockResolvedValue(createOverview())
    vi.mocked(subagentData.loadPluginSubagentDetail).mockResolvedValue({
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
        ],
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
    } as never)
    vi.mocked(subagentData.closePluginSubagentConversation).mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads overview, groups workspaces and refreshes detail by conversation id', async () => {
    let state!: ReturnType<typeof useSubagents>
    const Harness = defineComponent({
      setup() {
        state = useSubagents()
        return () => null
      },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    expect(state.subagentCount.value).toBe(2)
    expect(state.runningSubagentCount.value).toBe(1)
    expect(state.conversationWorkspaces.value).toHaveLength(2)
    expect(state.activeConversationId.value).toBe('conversation-1')
    expect(state.activeWorkspaceWindows.value.map((window) => window.label)).toEqual(['main', 'agent1'])
    expect(state.pagedSubagents.value.map((subagent) => subagent.conversationId)).toEqual([
      'subagent-conversation-1',
      'subagent-conversation-2',
    ])

    state.selectWindow('subagent-conversation-1')
    await flushPromises()

    expect(subagentData.loadPluginSubagentDetail).toHaveBeenCalledWith('subagent-conversation-1')
    expect(state.activeSubagentDetail.value?.conversationId).toBe('subagent-conversation-1')

    state.filter.value = 'running'
    await flushPromises()
    expect(state.filteredSubagentCount.value).toBe(1)

    state.filter.value = 'all'
    state.searchKeyword.value = '分析失败'
    await flushPromises()
    expect(state.filteredSubagentCount.value).toBe(1)
    expect(state.pagedSubagents.value.map((subagent) => subagent.conversationId)).toEqual([
      'subagent-conversation-2',
    ])

    await vi.advanceTimersByTimeAsync(5000)
    expect(subagentData.loadPluginSubagentOverview).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('closes one child conversation and refreshes overview', async () => {
    let state!: ReturnType<typeof useSubagents>
    const Harness = defineComponent({
      setup() {
        state = useSubagents()
        return () => null
      },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    await state.closeSubagentConversation('subagent-conversation-1')
    await flushPromises()

    expect(subagentData.closePluginSubagentConversation).toHaveBeenCalledWith('subagent-conversation-1')
    expect(subagentData.loadPluginSubagentOverview).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })
})
