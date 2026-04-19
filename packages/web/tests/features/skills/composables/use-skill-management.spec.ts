import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillManagement } from '@/features/skills/composables/use-skill-management'
import * as skillData from '@/features/skills/composables/skill-management.data'

vi.mock('@/features/skills/composables/skill-management.data', () => ({
  loadSkillCatalog: vi.fn(),
  refreshSkillCatalog: vi.fn(),
  saveSkillGovernance: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('useSkillManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(skillData.loadSkillCatalog).mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        governance: {
          loadPolicy: 'allow',
        },
        assets: [
          {
            path: 'templates/task.md',
            kind: 'template',
            textReadable: true,
            executable: false,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ])
    vi.mocked(skillData.refreshSkillCatalog).mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        governance: {
          loadPolicy: 'allow',
        },
        assets: [
          {
            path: 'templates/task.md',
            kind: 'template',
            textReadable: true,
            executable: false,
          },
        ],
        content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
      },
    ])
    vi.mocked(skillData.saveSkillGovernance).mockImplementation(async (skillId, payload) => ({
      id: skillId,
      name: '规划执行',
      description: '先拆任务，再逐步执行。',
      tags: ['planning'],
      sourceKind: 'project',
      entryPath: 'planner/SKILL.md',
      promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
      governance: {
        loadPolicy: payload.loadPolicy ?? 'allow',
      },
      assets: [
        {
          path: 'templates/task.md',
          kind: 'template',
          textReadable: true,
          executable: false,
        },
      ],
      content: '# Planner\n\n把复杂请求拆成 3-5 步，再开始执行。',
    }))
  })

  it('loads the skill catalog and aggregates catalog metrics', async () => {
    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.skills.value).toHaveLength(1)
    expect(state.projectCount.value).toBe(1)
    expect(state.userCount.value).toBe(0)
    expect(state.deniedCount.value).toBe(0)
    expect(state.packageCount.value).toBe(1)
    expect(state.executableCount.value).toBe(0)
  })

  it('updates skill governance in the local catalog', async () => {
    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    await state.updateSkillGovernance('project/planner', {
      loadPolicy: 'deny',
    })
    await flushPromises()

    expect(skillData.saveSkillGovernance).toHaveBeenCalledWith('project/planner', {
      loadPolicy: 'deny',
    })
    expect(state.skills.value[0]?.governance).toEqual({
      loadPolicy: 'deny',
    })
    expect(state.deniedCount.value).toBe(1)
  })
})
