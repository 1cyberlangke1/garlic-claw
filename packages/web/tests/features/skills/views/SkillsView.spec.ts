import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SkillsView from '@/modules/skills/views/SkillsView.vue'

vi.mock('@/modules/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
  }),
}))

vi.mock('@/modules/skills/composables/use-skill-management', () => ({
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
    enabledCount: computed(() => 0),
    totalCount: computed(() => 1),
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
  it('switches between skill details and event logs', async () => {
    const wrapper = mount(SkillsView)
    const skillCardText = () => wrapper.get('.skill-card').text()

    expect(wrapper.text()).toContain('技能目录')
    expect(wrapper.text()).toContain('天气查询')
    expect(wrapper.text()).toContain('已启用 0 / 1')
    expect(skillCardText()).toContain('weather')
    expect(skillCardText()).toContain('weather-query/SKILL.md')
    expect(wrapper.text()).toContain('请先确认地点，再查询天气')
    expect(wrapper.text()).not.toContain('skills 目录')
    expect(wrapper.text()).not.toContain('已禁用技能')
    expect(skillCardText()).not.toContain('禁用技能')
    expect(skillCardText()).not.toContain('skills/')
    expect(wrapper.text()).not.toContain('技能日志设置')
    expect(wrapper.text()).not.toContain('技能治理已更新')

    await wrapper.get('button[title="事件日志"]').trigger('click')

    expect(wrapper.text()).toContain('技能事件日志')
    expect(wrapper.text()).toContain('技能治理已更新')
    expect(wrapper.text()).not.toContain('技能日志设置')

    await wrapper.get('button[title="日志设置"]').trigger('click')

    expect(wrapper.text()).toContain('技能日志设置')
  })
})
