import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type {
  PluginSubagentDetail,
  PluginSubagentStatus,
  PluginSubagentSummary,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { usePagination } from '@/composables/use-pagination'
import {
  loadPluginSubagentDetail as loadSubagentDetail,
  loadPluginSubagentOverview as loadSubagentOverview,
  closePluginSubagentConversation as requestCloseSubagentConversation,
} from './subagents.data'

type SubagentFilter = 'all' | 'running' | 'completed' | 'error' | 'writeback-failed'
type SubagentWorkspaceWindow = SubagentMainWindow | SubagentSessionWindow

interface SubagentWorkspaceSummary {
  id: string
  label: string
  newestRequestedAt: string
  subagents: PluginSubagentSummary[]
  windows: SubagentWorkspaceWindow[]
}

interface SubagentMainWindow {
  id: 'main'
  kind: 'main'
  label: 'main'
}

interface SubagentSessionWindow {
  id: string
  kind: 'subagent'
  label: string
  conversationId: string
  status: PluginSubagentStatus
  summary: PluginSubagentSummary
}

const POLL_INTERVAL_MS = 5000
const MAIN_WINDOW_ID = 'main'
const GLOBAL_WORKSPACE_ID = '__global__'

export function useSubagents() {
  const requestState = useAsyncState(false)
  const detailState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const detailLoading = detailState.loading
  const detailError = detailState.error
  const subagents = shallowRef<PluginSubagentSummary[]>([])
  const activeSubagentDetail = shallowRef<PluginSubagentDetail | null>(null)
  const closingConversationId = ref<string | null>(null)
  const searchKeyword = ref('')
  const filter = ref<SubagentFilter>('all')
  const activeConversationId = ref<string | null>(null)
  const activeWindowId = ref<string>(MAIN_WINDOW_ID)
  const normalizedKeyword = computed(() => searchKeyword.value.trim().toLocaleLowerCase())
  const filteredSubagents = computed(() =>
    subagents.value.filter((subagent) =>
      matchesSubagent(subagent, normalizedKeyword.value)
      && matchesFilter(subagent, filter.value)),
  )
  const conversationWorkspaces = computed(() => createConversationWorkspaceSummaries(subagents.value))
  const activeConversationWorkspace = computed(() =>
    activeConversationId.value
      ? conversationWorkspaces.value.find((workspace) => workspace.id === activeConversationId.value) ?? null
      : null,
  )
  const activeWorkspaceWindows = computed(() => activeConversationWorkspace.value?.windows ?? [])
  const activeConversationSubagents = computed(() => activeConversationWorkspace.value?.subagents ?? [])
  const activeWindow = computed(() =>
    activeWorkspaceWindows.value.find((window) => window.id === activeWindowId.value) ?? activeWorkspaceWindows.value[0] ?? null,
  )
  const activeWindowKind = computed(() => activeWindow.value?.kind ?? 'main')
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
      const overview = await loadSubagentOverview()
      subagents.value = overview.subagents
      syncWorkspaceSelection()
      await refreshActiveSubagentDetail()
    } catch (caughtError) {
      requestState.setError(caughtError, '加载后台子代理失败')
    } finally {
      loading.value = false
    }
  }

  function selectConversation(conversationId: string) {
    if (activeConversationId.value === conversationId) {
      return
    }
    activeConversationId.value = conversationId
    activeWindowId.value = MAIN_WINDOW_ID
    void refreshActiveSubagentDetail()
  }

  function selectWindow(windowId: string) {
    if (activeWindowId.value === windowId) {
      return
    }
    activeWindowId.value = windowId
    void refreshActiveSubagentDetail()
  }

  function syncWorkspaceSelection() {
    if (conversationWorkspaces.value.length === 0) {
      activeConversationId.value = null
      activeWindowId.value = MAIN_WINDOW_ID
      activeSubagentDetail.value = null
      detailState.clearError()
      return
    }
    const nextConversation = conversationWorkspaces.value.find(
      (workspace) => workspace.id === activeConversationId.value,
    ) ?? conversationWorkspaces.value[0]
    activeConversationId.value = nextConversation.id
    if (!nextConversation.windows.some((window) => window.id === activeWindowId.value)) {
      activeWindowId.value = MAIN_WINDOW_ID
    }
  }

  async function refreshActiveSubagentDetail() {
    const window = activeWindow.value
    if (!window || window.kind === 'main') {
      activeSubagentDetail.value = null
      detailState.clearError()
      return
    }
    detailLoading.value = true
    detailState.clearError()
    try {
      activeSubagentDetail.value = await loadSubagentDetail(window.conversationId)
    } catch (caughtError) {
      activeSubagentDetail.value = null
      detailState.setError(caughtError, '加载子代理上下文失败')
    } finally {
      detailLoading.value = false
    }
  }

  async function closeSubagentConversation(conversationId: string) {
    if (!conversationId.trim() || closingConversationId.value) {
      return
    }
    closingConversationId.value = conversationId
    requestState.clearError()
    try {
      await requestCloseSubagentConversation(conversationId)
      await refreshAll()
    } catch (caughtError) {
      requestState.setError(caughtError, '关闭后台子代理失败')
    } finally {
      if (closingConversationId.value === conversationId) {
        closingConversationId.value = null
      }
    }
  }

  return {
    loading,
    error,
    appError,
    detailLoading,
    detailError,
    subagents,
    conversationWorkspaces,
    activeConversationId,
    activeConversationSubagents,
    activeWindowId,
    activeWindow,
    activeWindowKind,
    activeWorkspaceWindows,
    activeSubagentDetail,
    closingConversationId,
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
    selectConversation,
    selectWindow,
    refreshAll,
    closeSubagentConversation,
  }
}

function createConversationWorkspaceSummaries(
  subagents: PluginSubagentSummary[],
): SubagentWorkspaceSummary[] {
  const workspaces = new Map<string, PluginSubagentSummary[]>()
  for (const subagent of subagents) {
    const workspaceId = readWorkspaceId(subagent)
    const current = workspaces.get(workspaceId)
    if (current) {
      current.push(subagent)
      continue
    }
    workspaces.set(workspaceId, [subagent])
  }
  return [...workspaces.entries()]
    .map(([workspaceId, workspaceSubagents]) => {
      const orderedSubagents = [...workspaceSubagents].sort(compareSubagentsByRequestedAt)
      const windows: SubagentWorkspaceWindow[] = [
        {
          id: MAIN_WINDOW_ID,
          kind: 'main',
          label: 'main',
        },
        ...orderedSubagents.map((subagent, index) => ({
          id: subagent.conversationId,
          kind: 'subagent' as const,
          label: readSubagentWindowLabel(subagent, index),
          conversationId: subagent.conversationId,
          status: subagent.status,
          summary: subagent,
        })),
      ]
      return {
        id: workspaceId,
        label: readWorkspaceLabel(workspaceId),
        newestRequestedAt: orderedSubagents.at(-1)?.requestedAt ?? '',
        subagents: orderedSubagents,
        windows,
      }
    })
    .sort((left, right) => right.newestRequestedAt.localeCompare(left.newestRequestedAt))
}

function compareSubagentsByRequestedAt(left: PluginSubagentSummary, right: PluginSubagentSummary): number {
  const requestedAtDiff = new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()
  if (requestedAtDiff !== 0) {
    return requestedAtDiff
  }
  return left.conversationId.localeCompare(right.conversationId)
}

function readWorkspaceId(subagent: PluginSubagentSummary): string {
  return subagent.parentConversationId?.trim() || GLOBAL_WORKSPACE_ID
}

function readWorkspaceLabel(workspaceId: string): string {
  return workspaceId === GLOBAL_WORKSPACE_ID ? '独立后台任务' : workspaceId
}

function matchesSubagent(subagent: PluginSubagentSummary, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  return [
    subagent.title,
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

function readSubagentWindowLabel(subagent: PluginSubagentSummary, index: number): string {
  const title = subagent.title.trim()
  return title || `agent${index + 1}`
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
