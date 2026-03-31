import { computed, ref, watch } from 'vue'
import type {
  ConversationSkillState,
  SkillDetail,
} from '@garlic-claw/shared'
import * as api from '../api'
import type { useChatStore } from '../stores/chat'

export function useSkillManagement(chat: ReturnType<typeof useChatStore>) {
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<string | null>(null)
  const searchKeyword = ref('')
  const skills = ref<SkillDetail[]>([])
  const selectedSkillId = ref<string | null>(null)
  const conversationSkillState = ref<ConversationSkillState | null>(null)
  let conversationSkillRequestId = 0

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
  const selectedSkill = computed(() => filteredSkills.value.find((skill) => skill.id === selectedSkillId.value)
    ?? skills.value.find((skill) => skill.id === selectedSkillId.value)
    ?? filteredSkills.value[0]
    ?? skills.value[0]
    ?? null)
  const totalCount = computed(() => skills.value.length)
  const activeCount = computed(() => conversationSkillState.value?.activeSkillIds.length ?? 0)
  const restrictedCount = computed(() =>
    skills.value.filter((skill) => skill.toolPolicy.allow.length > 0 || skill.toolPolicy.deny.length > 0).length,
  )

  watch(
    () => chat.currentConversationId,
    async (conversationId) => {
      await refreshConversationSkillState(conversationId)
    },
    { immediate: true },
  )

  void loadSkills()

  async function loadSkills() {
    loading.value = true
    error.value = null

    try {
      skills.value = await api.listSkills()
      if (!selectedSkillId.value || !skills.value.some((skill) => skill.id === selectedSkillId.value)) {
        selectedSkillId.value = skills.value[0]?.id ?? null
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载 skills 失败'
    } finally {
      loading.value = false
    }
  }

  async function refreshAll() {
    refreshing.value = true
    error.value = null

    try {
      skills.value = await api.refreshSkills()
      if (!selectedSkillId.value || !skills.value.some((skill) => skill.id === selectedSkillId.value)) {
        selectedSkillId.value = skills.value[0]?.id ?? null
      }
      await refreshConversationSkillState(chat.currentConversationId)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '刷新 skills 失败'
    } finally {
      refreshing.value = false
    }
  }

  async function toggleSkill(skillId: string) {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }

    const currentIds = conversationSkillState.value?.activeSkillIds ?? []
    const activeSet = new Set(currentIds)
    if (activeSet.has(skillId)) {
      activeSet.delete(skillId)
    } else {
      activeSet.add(skillId)
    }

    conversationSkillState.value = await api.updateConversationSkills(conversationId, {
      activeSkillIds: [...activeSet],
    })
  }

  async function clearConversationSkills() {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }

    conversationSkillState.value = await api.updateConversationSkills(conversationId, {
      activeSkillIds: [],
    })
  }

  function selectSkill(skillId: string) {
    selectedSkillId.value = skillId
  }

  async function refreshConversationSkillState(
    conversationId: string | null = chat.currentConversationId,
  ) {
    const requestId = ++conversationSkillRequestId
    if (!conversationId) {
      conversationSkillState.value = null
      return
    }

    try {
      const state = await api.getConversationSkills(conversationId)
      if (
        requestId !== conversationSkillRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationSkillState.value = state
    } catch {
      if (
        requestId !== conversationSkillRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationSkillState.value = {
        activeSkillIds: [],
        activeSkills: [],
      }
    }
  }

  return {
    loading,
    refreshing,
    error,
    searchKeyword,
    skills,
    filteredSkills,
    selectedSkillId,
    selectedSkill,
    conversationSkillState,
    totalCount,
    activeCount,
    restrictedCount,
    selectSkill,
    toggleSkill,
    clearConversationSkills,
    refreshAll,
  }
}
