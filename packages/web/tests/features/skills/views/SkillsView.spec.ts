import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SkillsView from '@/features/skills/views/SkillsView.vue'

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
  }),
}))

vi.mock('@/features/skills/composables/use-skill-management', () => ({
  useSkillManagement: () => ({
    loading: ref(false),
    error: ref(null),
    refreshing: ref(false),
    searchKeyword: ref(''),
    skills: shallowRef([
      {
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
        tags: ['weather'],
        sourceKind: 'project',
        entryPath: 'weather-query/SKILL.md',
        promptPreview: '请先确认地点，再查询天气。',
        governance: {
          loadPolicy: 'deny',
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
        assets: [
          {
            path: 'scripts/weather.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# weather-query\n\n请先确认地点，再查询天气。',
      },
    ]),
    filteredSkills: computed(() => [
      {
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
        tags: ['weather'],
        sourceKind: 'project',
        entryPath: 'weather-query/SKILL.md',
        promptPreview: '请先确认地点，再查询天气。',
        governance: {
          loadPolicy: 'deny',
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
        assets: [
          {
            path: 'scripts/weather.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# weather-query\n\n请先确认地点，再查询天气。',
      },
    ]),
    selectedSkillId: ref('project/weather-query'),
    selectedSkill: computed(() => ({
      id: 'project/weather-query',
      name: '天气查询',
      description: '查询指定地点天气。',
      tags: ['weather'],
      sourceKind: 'project',
      entryPath: 'weather-query/SKILL.md',
      promptPreview: '请先确认地点，再查询天气。',
      governance: {
        loadPolicy: 'deny',
        eventLog: {
          maxFileSizeMb: 1,
        },
      },
      assets: [
        {
          path: 'scripts/weather.js',
          kind: 'script',
          textReadable: true,
          executable: true,
        },
      ],
      content: '# weather-query\n\n请先确认地点，再查询天气。',
    })),
    totalCount: computed(() => 1),
    directoryCount: computed(() => 1),
    deniedCount: computed(() => 1),
    packageCount: computed(() => 1),
    executableCount: computed(() => 1),
    mutatingSkillId: ref(null),
    eventLoading: ref(false),
    eventLogs: shallowRef([
      {
        id: 'event-1',
        createdAt: '2026-04-19T00:00:00.000Z',
        level: 'info',
        message: '技能治理已更新',
        metadata: {
          loadPolicy: 'deny',
        },
        type: 'governance:updated',
      },
    ]),
    eventQuery: shallowRef({ limit: 50 }),
    eventNextCursor: ref(null),
    selectSkill: vi.fn(),
    updateSkillGovernance: vi.fn(),
    refreshSkillEvents: vi.fn(),
    loadMoreSkillEvents: vi.fn(),
    refreshAll: vi.fn(),
  }),
}))

describe('SkillsView', () => {
  it('renders the skill workspace, governance state, and markdown preview', () => {
    const wrapper = mount(SkillsView)

    expect(wrapper.text()).toContain('技能目录')
    expect(wrapper.text()).toContain('天气查询')
    expect(wrapper.text()).toContain('skills 目录')
    expect(wrapper.text()).toContain('已拒绝加载')
    expect(wrapper.text()).toContain('拒绝加载')
    expect(wrapper.text()).toContain('scripts/weather.js')
    expect(wrapper.text()).toContain('请先确认地点，再查询天气')
    expect(wrapper.text()).toContain('技能日志设置')
    expect(wrapper.text()).toContain('技能事件日志')
    expect(wrapper.text()).toContain('技能治理已更新')
  })
})
