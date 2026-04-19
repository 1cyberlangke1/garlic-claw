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
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        governance: {
          loadPolicy: 'deny',
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
        assets: [
          {
            path: 'scripts/plan.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ]),
    filteredSkills: computed(() => [
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        governance: {
          loadPolicy: 'deny',
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
        assets: [
          {
            path: 'scripts/plan.js',
            kind: 'script',
            textReadable: true,
            executable: true,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ]),
    selectedSkillId: ref('project/planner'),
    selectedSkill: computed(() => ({
      id: 'project/planner',
      name: '规划执行',
      description: '先拆任务，再逐步执行。',
      tags: ['planning'],
      sourceKind: 'project',
      entryPath: 'planner/SKILL.md',
      promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
      governance: {
        loadPolicy: 'deny',
        eventLog: {
          maxFileSizeMb: 1,
        },
      },
      assets: [
        {
          path: 'scripts/plan.js',
          kind: 'script',
          textReadable: true,
          executable: true,
        },
      ],
      content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
    })),
    totalCount: computed(() => 1),
    projectCount: computed(() => 1),
    userCount: computed(() => 0),
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
    expect(wrapper.text()).toContain('规划执行')
    expect(wrapper.text()).toContain('已拒绝加载')
    expect(wrapper.text()).toContain('拒绝加载')
    expect(wrapper.text()).toContain('scripts/plan.js')
    expect(wrapper.text()).toContain('把复杂请求拆成 3-5 步')
    expect(wrapper.text()).toContain('技能日志设置')
    expect(wrapper.text()).toContain('技能事件日志')
    expect(wrapper.text()).toContain('技能治理已更新')
  })
})
