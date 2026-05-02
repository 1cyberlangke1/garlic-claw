import { computed, ref, shallowRef, watch } from 'vue'
import type { EventLogQuery, EventLogRecord, UpdateSkillGovernancePayload, SkillDetail } from '@garlic-claw/shared'
import { useAsyncState } from '@/shared/composables/use-async-state'
import {
  dedupeEventLogs,
  loadSkillEvents,
  loadSkillCatalog,
  normalizeEventLogQuery,
  refreshSkillCatalog,
  saveSkillGovernance,
} from './skill-management.data'

export function useSkillManagement() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const refreshing = ref(false)
  const searchKeyword = ref('')
  const skills = ref<SkillDetail[]>([])
  const selectedSkillId = ref<string | null>(null)
  const mutatingSkillId = ref<string | null>(null)
  const eventLoading = ref(false)
  const eventLogs = shallowRef<EventLogRecord[]>([])
  const eventQuery = shallowRef<EventLogQuery>({ limit: 50 })
  const eventNextCursor = ref<string | null>(null)

  const filteredSkills = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (!keyword) {
      return skills.value
    }

    return skills.value.filter((skill) => {
      const haystack = [
        skill.id,
        skill.name,
        skill.description,
        skill.promptPreview,
        ...skill.tags,
      ].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  })
  const selectedSkill = computed(() => {
    const currentSkillId = selectedSkillId.value
    if (currentSkillId) {
      return filteredSkills.value.find((skill) => skill.id === currentSkillId)
        ?? skills.value.find((skill) => skill.id === currentSkillId)
        ?? null
    }

    return filteredSkills.value[0] ?? skills.value[0] ?? null
  })
  const totalCount = computed(() => skills.value.length)
  const enabledCount = computed(() =>
    skills.value.filter((skill) => skill.governance.loadPolicy === 'allow').length,
  )
  const directoryCount = computed(() => skills.value.length)
  const deniedCount = computed(() =>
    skills.value.filter((skill) => skill.governance.loadPolicy === 'deny').length,
  )
  const packageCount = computed(() =>
    skills.value.filter((skill) => skill.assets.length > 0).length,
  )
  const executableCount = computed(() =>
    skills.value.filter((skill) => skill.assets.some((asset) => asset.executable)).length,
  )

  void loadSkills()

  watch(
    selectedSkill,
    async (skill) => {
      if (!skill) {
        eventLogs.value = []
        eventNextCursor.value = null
        return
      }
      await refreshSkillEvents()
    },
    { immediate: true },
  )

  function replaceSkills(nextSkills: SkillDetail[]) {
    skills.value = nextSkills
    selectedSkillId.value = replaceSelectedSkillId(nextSkills, selectedSkillId.value)
  }

  async function loadSkills() {
    loading.value = true
    requestState.clearError()

    try {
      replaceSkills(await loadSkillCatalog())
    } catch (cause) {
      requestState.setError(cause, '加载技能失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshAll() {
    refreshing.value = true
    requestState.clearError()

    try {
      replaceSkills(await refreshSkillCatalog())
    } catch (cause) {
      requestState.setError(cause, '刷新技能失败')
    } finally {
      refreshing.value = false
    }
  }

  function selectSkill(skillId: string) {
    selectedSkillId.value = skillId
  }

  async function updateSkillGovernance(
    skillId: string,
    patch: UpdateSkillGovernancePayload,
  ) {
    mutatingSkillId.value = skillId
    requestState.clearError()

    try {
      const updated = await saveSkillGovernance(skillId, patch)
      replaceSkills(applySkillUpdate(skills.value, updated))
    } catch (cause) {
      requestState.setError(cause, '更新技能治理失败')
    } finally {
      if (mutatingSkillId.value === skillId) {
        mutatingSkillId.value = null
      }
    }
  }

  async function refreshSkillEvents(query: EventLogQuery = eventQuery.value) {
    if (!selectedSkill.value) {
      eventLogs.value = []
      eventQuery.value = normalizeEventLogQuery(query)
      eventNextCursor.value = null
      return
    }

    eventLoading.value = true
    requestState.clearError()
    try {
      const normalized = normalizeEventLogQuery(query)
      const result = await loadSkillEvents(selectedSkill.value.id, normalized)
      eventQuery.value = normalized
      eventLogs.value = result.items
      eventNextCursor.value = result.nextCursor
    } catch (cause) {
      requestState.setError(cause, '加载技能事件日志失败')
    } finally {
      eventLoading.value = false
    }
  }

  async function loadMoreSkillEvents(query?: EventLogQuery) {
    const normalized = normalizeEventLogQuery(query ?? eventQuery.value)
    const cursor = query?.cursor ?? eventNextCursor.value
    if (!selectedSkill.value || !cursor) {
      return
    }

    eventLoading.value = true
    requestState.clearError()
    try {
      const result = await loadSkillEvents(selectedSkill.value.id, {
        ...normalized,
        cursor,
      })
      eventQuery.value = normalized
      eventLogs.value = dedupeEventLogs([...eventLogs.value, ...result.items])
      eventNextCursor.value = result.nextCursor
    } catch (cause) {
      requestState.setError(cause, '加载更多技能事件日志失败')
    } finally {
      eventLoading.value = false
    }
  }

  return {
    loading,
    refreshing,
    error,
    appError,
    mutatingSkillId,
    eventLoading,
    eventLogs,
    eventQuery,
    eventNextCursor,
    searchKeyword,
    skills,
    filteredSkills,
    selectedSkillId,
    selectedSkill,
    totalCount,
    enabledCount,
    directoryCount,
    deniedCount,
    packageCount,
    executableCount,
    selectSkill,
    updateSkillGovernance,
    refreshSkillEvents,
    loadMoreSkillEvents,
    refreshAll,
  }
}

function applySkillUpdate(skills: SkillDetail[], updated: SkillDetail): SkillDetail[] {
  const index = skills.findIndex((skill) => skill.id === updated.id)
  if (index === -1) {
    return skills
  }

  const next = [...skills]
  next.splice(index, 1, updated)
  return next
}

function replaceSelectedSkillId(
  skills: SkillDetail[],
  currentSkillId: string | null,
): string | null {
  if (currentSkillId && skills.some((skill) => skill.id === currentSkillId)) {
    return currentSkillId
  }

  return skills[0]?.id ?? null
}
