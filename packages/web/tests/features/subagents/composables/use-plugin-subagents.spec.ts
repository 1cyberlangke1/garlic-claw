import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginSubagents } from '@/features/subagents/composables/use-plugin-subagents'
import * as subagentData from '@/features/subagents/composables/plugin-subagents.data'

vi.mock('@/features/subagents/composables/plugin-subagents.data', () => ({
  loadPluginSubagentDetail: vi.fn(),
  loadPluginSubagentOverview: vi.fn(),
  removePluginSubagentSession: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createOverview() {
  return {
    subagents: [
      {
        description: '继续已有后台子代理',
        sessionId: 'subagent-session-1',
        sessionMessageCount: 3,
        sessionUpdatedAt: '2026-03-30T12:00:05.000Z',
        pluginId: 'builtin.subagent-delegate',
        pluginDisplayName: '子代理委派',
        runtimeKind: 'local' as const,
        status: 'running' as const,
        requestPreview: '请帮我总结当前对话',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        writeBackStatus: 'pending' as const,
        requestedAt: '2026-03-30T12:00:00.000Z',
        startedAt: '2026-03-30T12:00:01.000Z',
        finishedAt: null,
        conversationId: 'conversation-1',
      },
      {
        description: '分析失败插件',
        sessionId: 'subagent-session-2',
        sessionMessageCount: 4,
        sessionUpdatedAt: '2026-03-30T11:50:05.000Z',
        pluginId: 'remote.ops-helper',
        pluginDisplayName: '运维助手',
        runtimeKind: 'remote' as const,
        status: 'completed' as const,
        requestPreview: '请分析最近失败的插件',
        resultPreview: '这是后台子代理总结',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        writeBackStatus: 'sent' as const,
        writeBackMessageId: 'assistant-message-2',
        requestedAt: '2026-03-30T11:50:00.000Z',
        startedAt: '2026-03-30T11:50:01.000Z',
        finishedAt: '2026-03-30T11:50:05.000Z',
      },
    ],
  }
}

describe('usePluginSubagents', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(subagentData.loadPluginSubagentOverview).mockResolvedValue(createOverview())
    vi.mocked(subagentData.loadPluginSubagentDetail).mockResolvedValue({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
      },
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      request: {
        messages: [
          {
            content: '请帮我总结当前对话',
            role: 'user',
          },
        ],
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
      startedAt: '2026-03-30T12:00:01.000Z',
      status: 'running',
      requestedAt: '2026-03-30T12:00:00.000Z',
      writeBackStatus: 'pending',
      finishedAt: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the overview, filters by keyword and subagent status, and keeps polling', async () => {
    let state!: ReturnType<typeof usePluginSubagents>
    const Harness = defineComponent({
      setup() {
        state = usePluginSubagents()
        return () => null
      },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    expect(state.subagentCount.value).toBe(2)
    expect(state.runningSubagentCount.value).toBe(1)
    expect(state.conversationWorkspaces.value).toHaveLength(2)
    expect(state.activeConversationId.value).toBe('conversation-1')
    expect(state.activeWorkspaceWindows.value.map((window) => window.label)).toEqual([
      'main',
      'agent1',
    ])
    expect(state.pagedSubagents.value.map((subagent) => subagent.sessionId)).toEqual([
      'subagent-session-1',
      'subagent-session-2',
    ])

    state.selectWindow('subagent-session-1')
    await flushPromises()

    expect(subagentData.loadPluginSubagentOverview).toHaveBeenCalledTimes(1)
    expect(subagentData.loadPluginSubagentDetail).toHaveBeenCalledWith('subagent-session-1')
    expect(state.activeSubagentDetail.value?.sessionId).toBe('subagent-session-1')

    state.filter.value = 'running'
    await flushPromises()

    expect(state.filteredSubagentCount.value).toBe(1)
    expect(state.pagedSubagents.value.map((subagent) => subagent.sessionId)).toEqual([
      'subagent-session-1',
    ])

    state.filter.value = 'all'
    state.searchKeyword.value = '分析失败'
    await flushPromises()

    expect(state.filteredSubagentCount.value).toBe(1)
    expect(state.pagedSubagents.value.map((subagent) => subagent.sessionId)).toEqual([
      'subagent-session-2',
    ])

    await vi.advanceTimersByTimeAsync(5000)
    expect(subagentData.loadPluginSubagentOverview).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('removes the active subagent session and clears the current workspace window', async () => {
    vi.mocked(subagentData.loadPluginSubagentOverview)
      .mockResolvedValueOnce(createOverview())
      .mockResolvedValueOnce({ subagents: [] })
    vi.mocked(subagentData.removePluginSubagentSession).mockResolvedValue(true)

    let state!: ReturnType<typeof usePluginSubagents>
    const Harness = defineComponent({
      setup() {
        state = usePluginSubagents()
        return () => null
      },
    })

    const wrapper = mount(Harness)
    await flushPromises()

    state.selectWindow('subagent-session-1')
    await flushPromises()
    await state.removeSubagentSession('subagent-session-1')
    await flushPromises()

    expect(subagentData.removePluginSubagentSession).toHaveBeenCalledWith('subagent-session-1')
    expect(state.subagentCount.value).toBe(0)
    expect(state.conversationWorkspaces.value).toEqual([])
    expect(state.activeConversationId.value).toBeNull()
    expect(state.activeWindowId.value).toBe('main')
    expect(state.activeSubagentDetail.value).toBeNull()

    wrapper.unmount()
  })
})
