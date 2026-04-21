import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { PluginSubagentSummary } from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { usePagination } from '@/composables/use-pagination'
import {
  loadPluginSubagentOverview,
} from './plugin-subagents.data'

type SubagentFilter = 'all' | 'running' | 'completed' | 'error' | 'writeback-failed'

const POLL_INTERVAL_MS = 5000

export function usePluginSubagents() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const subagents = shallowRef<PluginSubagentSummary[]>([])
  const searchKeyword = ref('')
  const filter = ref<SubagentFilter>('all')
  const normalizedKeyword = computed(() => searchKeyword.value.trim().toLocaleLowerCase())
  const filteredSubagents = computed(() =>
    subagents.value.filter((subagent) =>
      matchesSubagent(subagent, normalizedKeyword.value)
      && matchesFilter(subagent, filter.value)),
  )
  const orderedSubagents = computed(() =>
    [...filteredSubagents.value].sort((left, right) => {
      const attentionDiff = subagentAttentionWeight(left) - subagentAttentionWeight(right)
      if (attentionDiff !== 0) {
        return attentionDiff
      }

      return new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime()
    }),
  )
  const {
    currentPage: page,
    pageCount,
    pagedItems: pagedSubagents,
    rangeStart,
    rangeEnd,
    canGoPrev: canGoPrevPage,
    canGoNext: canGoNextPage,
    resetPage,
    goPrevPage,
    goNextPage,
  } = usePagination(orderedSubagents, 8)
  const subagentCount = computed(() => subagents.value.length)
  const filteredSubagentCount = computed(() => filteredSubagents.value.length)
  const runningSubagentCount = computed(() =>
    subagents.value.filter((subagent) => subagent.status === 'queued' || subagent.status === 'running').length,
  )
  const errorSubagentCount = computed(() =>
    subagents.value.filter((subagent) => subagent.status === 'error').length,
  )
  const writeBackAttentionCount = computed(() =>
    subagents.value.filter((subagent) => subagent.writeBackStatus === 'pending' || subagent.writeBackStatus === 'failed').length,
  )

  let pollTimer: ReturnType<typeof setInterval> | null = null

  watch([searchKeyword, filter], () => {
    resetPage()
  })

  onMounted(() => {
    void refreshAll()
    pollTimer = setInterval(() => {
      void refreshAll()
    }, POLL_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  })

  async function refreshAll() {
    loading.value = true
    requestState.clearError()
    try {
      const overview = await loadPluginSubagentOverview()
      subagents.value = overview.subagents
    } catch (caughtError) {
      requestState.setError(caughtError, '加载后台子代理失败')
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    appError,
    subagents,
    searchKeyword,
    filter,
    pagedSubagents,
    page,
    pageCount,
    rangeStart,
    rangeEnd,
    canGoPrevPage,
    canGoNextPage,
    goPrevPage,
    goNextPage,
    subagentCount,
    filteredSubagentCount,
    runningSubagentCount,
    errorSubagentCount,
    writeBackAttentionCount,
    refreshAll,
  }
}

function matchesSubagent(subagent: PluginSubagentSummary, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    subagent.description ?? '',
    subagent.pluginDisplayName ?? '',
    subagent.pluginId,
    subagent.requestPreview,
    subagent.resultPreview ?? '',
    subagent.providerId ?? '',
    subagent.modelId ?? '',
    subagent.error ?? '',
    subagent.writeBackError ?? '',
    subagent.writeBackTarget?.id ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(keyword)
}

function matchesFilter(subagent: PluginSubagentSummary, filter: SubagentFilter): boolean {
  switch (filter) {
    case 'running':
      return subagent.status === 'queued' || subagent.status === 'running'
    case 'completed':
      return subagent.status === 'completed'
    case 'error':
      return subagent.status === 'error'
    case 'writeback-failed':
      return subagent.writeBackStatus === 'failed'
    default:
      return true
  }
}

function subagentAttentionWeight(subagent: PluginSubagentSummary): number {
  if (subagent.status === 'error') {
    return 0
  }
  if (subagent.writeBackStatus === 'failed') {
    return 1
  }
  if (subagent.status === 'queued' || subagent.status === 'running') {
    return 2
  }
  if (subagent.writeBackStatus === 'pending') {
    return 3
  }

  return 4
}
