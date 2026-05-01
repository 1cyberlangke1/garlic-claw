import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSkillManagement } from '@/modules/skills/composables/use-skill-management'
import * as skillData from '@/modules/skills/composables/skill-management.data'

vi.mock('@/modules/skills/composables/skill-management.data', () => ({
  dedupeEventLogs: vi.fn((items) => items),
  loadSkillCatalog: vi.fn(),
  loadSkillEvents: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  normalizeEventLogQuery: vi.fn((query) => ({
    limit: query.limit ?? 50,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  })),
  refreshSkillCatalog: vi.fn(),
  saveSkillGovernance: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('useSkillManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(skillData.loadSkillCatalog).mockResolvedValue([
      {
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
        tags: ['weather'],
        sourceKind: 'project',
        entryPath: 'weather-query/SKILL.md',
        promptPreview: '请先确认地点，再查询天气。',
        governance: {
          loadPolicy: 'allow',
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
    ])
    vi.mocked(skillData.refreshSkillCatalog).mockResolvedValue([
      {
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
        tags: ['weather'],
        sourceKind: 'project',
        entryPath: 'weather-query/SKILL.md',
        promptPreview: '请先确认地点，再查询天气。',
        governance: {
          loadPolicy: 'allow',
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
    ])
    vi.mocked(skillData.saveSkillGovernance).mockImplementation(async (skillId, payload) => ({
      id: skillId,
      name: '天气查询',
      description: '查询指定地点天气。',
      tags: ['weather'],
      sourceKind: 'project',
      entryPath: 'weather-query/SKILL.md',
      promptPreview: '请先确认地点，再查询天气。',
      governance: {
        loadPolicy: payload.loadPolicy ?? 'allow',
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
    expect(state.directoryCount.value).toBe(1)
    expect(state.deniedCount.value).toBe(0)
    expect(state.packageCount.value).toBe(1)
    expect(state.executableCount.value).toBe(1)
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

    await state.updateSkillGovernance('project/weather-query', {
      loadPolicy: 'deny',
    })
    await flushPromises()

    expect(skillData.saveSkillGovernance).toHaveBeenCalledWith('project/weather-query', {
      loadPolicy: 'deny',
    })
    expect(state.skills.value[0]?.governance).toEqual({
      loadPolicy: 'deny',
    })
    expect(state.deniedCount.value).toBe(1)
  })

  it('loads more skill events with nextCursor and appends the next page', async () => {
    vi.mocked(skillData.loadSkillEvents)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-3',
            type: 'skill:error',
            level: 'error',
            message: 'third',
            metadata: null,
            createdAt: '2026-04-21T00:00:03.000Z',
          },
          {
            id: 'event-2',
            type: 'skill:warn',
            level: 'warn',
            message: 'second',
            metadata: null,
            createdAt: '2026-04-21T00:00:02.000Z',
          },
        ],
        nextCursor: 'event-2',
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'event-1',
            type: 'skill:info',
            level: 'info',
            message: 'first',
            metadata: null,
            createdAt: '2026-04-21T00:00:01.000Z',
          },
        ],
        nextCursor: null,
      })

    let state!: ReturnType<typeof useSkillManagement>
    const Harness = defineComponent({
      setup() {
        state = useSkillManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2'])
    expect(state.eventNextCursor.value).toBe('event-2')

    await state.loadMoreSkillEvents()
    await flushPromises()

    expect(skillData.loadSkillEvents).toHaveBeenNthCalledWith(2, 'project/weather-query', {
      limit: 50,
      cursor: 'event-2',
    })
    expect(state.eventLogs.value.map((entry) => entry.id)).toEqual(['event-3', 'event-2', 'event-1'])
    expect(state.eventNextCursor.value).toBeNull()
  })
})
