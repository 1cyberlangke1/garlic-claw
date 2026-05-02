import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  EventLogQuery,
  EventLogRecord,
  EventLogSettings,
  McpConfigSnapshot,
  McpServerConfig,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/shared/composables/use-async-state'
import { emitInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'
import {
  createMcpServerConfig,
  dedupeMcpEventLogs,
  deleteMcpServerConfig,
  loadMcpServerEvents,
  loadMcpConfigSnapshot,
  normalizeMcpEventQuery,
  updateMcpServerConfig,
} from './mcp-config-management.data'
import { useUiStore } from '@/shared/stores/ui'

const emptySnapshot = (): McpConfigSnapshot => ({
  configPath: '',
  servers: [],
})

export function useMcpConfigManagement() {
  const uiStore = useUiStore()
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const saving = ref(false)
  const savingEventLog = ref(false)
  const deleting = ref(false)
  const snapshot = shallowRef<McpConfigSnapshot>(emptySnapshot())
  const selectedServerName = ref<string | null>(null)
  const eventLoading = ref(false)
  const eventLogs = shallowRef<EventLogRecord[]>([])
  const eventQuery = shallowRef<EventLogQuery>({ limit: 50 })
  const eventNextCursor = ref<string | null>(null)
  let refreshRequestId = 0
  let activeEventRequestId = 0

  const servers = computed(() => snapshot.value.servers)
  const selectedServer = computed(() =>
    servers.value.find((server) => server.name === selectedServerName.value) ?? null,
  )

  onMounted(() => {
    void refresh()
  })

  async function refresh(preferredName = selectedServerName.value) {
    const requestId = ++refreshRequestId
    loading.value = true
    requestState.clearError()
    try {
      const nextSnapshot = await loadMcpConfigSnapshot()
      if (requestId !== refreshRequestId) {
        return
      }
      snapshot.value = nextSnapshot
      const fallback = nextSnapshot.servers.find((server) => server.name === preferredName)
        ?? nextSnapshot.servers[0]
        ?? null
      selectedServerName.value = fallback?.name ?? null
      if (fallback) {
        await refreshServerEvents(undefined, fallback.name)
      } else {
        clearServerEvents()
      }
    } catch (caughtError) {
      if (requestId !== refreshRequestId) {
        return
      }
      requestState.setError(caughtError, '加载 MCP 配置失败')
    } finally {
      if (requestId === refreshRequestId) {
        loading.value = false
      }
    }
  }

  function selectServer(name: string | null) {
    activeEventRequestId += 1
    selectedServerName.value = servers.value.some((server) => server.name === name)
      ? name
      : null
    eventQuery.value = readBaseMcpEventQuery({ limit: 50 })
    if (selectedServerName.value) {
      clearServerEvents()
      void refreshServerEvents(eventQuery.value, selectedServerName.value)
      return
    }
    clearServerEvents()
  }

  async function createServer(input: McpServerConfig) {
    saving.value = true
    requestState.clearError()
    try {
      const saved = await createMcpServerConfig(input)
      emitInternalConfigChanged({ scope: 'mcp' })
      await refresh(saved.name)
      uiStore.notify('MCP server 已创建')
      return saved
    } catch (caughtError) {
      throw requestState.setError(caughtError, '创建 MCP server 失败')
    } finally {
      saving.value = false
    }
  }

  async function updateServer(currentName: string, input: McpServerConfig) {
    saving.value = true
    requestState.clearError()
    try {
      const saved = await updateMcpServerConfig(currentName, input)
      emitInternalConfigChanged({ scope: 'mcp' })
      await refresh(saved.name)
      uiStore.notify('MCP server 已更新')
      return saved
    } catch (caughtError) {
      throw requestState.setError(caughtError, '更新 MCP server 失败')
    } finally {
      saving.value = false
    }
  }

  async function deleteServer(name: string) {
    deleting.value = true
    requestState.clearError()
    try {
      const result = await deleteMcpServerConfig(name)
      emitInternalConfigChanged({ scope: 'mcp' })
      await refresh()
      uiStore.notify('MCP server 已删除')
      return result
    } catch (caughtError) {
      throw requestState.setError(caughtError, '删除 MCP server 失败')
    } finally {
      deleting.value = false
    }
  }

  async function saveServerEventLog(settings: EventLogSettings) {
    if (!selectedServer.value) {
      return null
    }

    savingEventLog.value = true
    requestState.clearError()
    try {
      const saved = await updateMcpServerConfig(selectedServer.value.name, {
        ...selectedServer.value,
        eventLog: settings,
      })
      await refresh(saved.name)
      uiStore.notify('MCP 日志设置已更新')
      return saved
    } catch (caughtError) {
      throw requestState.setError(caughtError, '更新 MCP 日志设置失败')
    } finally {
      savingEventLog.value = false
    }
  }

  async function refreshServerEvents(
    query: EventLogQuery = eventQuery.value,
    serverName = selectedServerName.value,
  ) {
    const baseQuery = readBaseMcpEventQuery(query)
    if (!serverName) {
      clearServerEvents()
      eventQuery.value = baseQuery
      return
    }

    const requestId = ++activeEventRequestId
    eventLoading.value = true
    requestState.clearError()
    try {
      const result = await loadMcpServerEvents(serverName, baseQuery)
      if (requestId !== activeEventRequestId || selectedServerName.value !== serverName) {
        return
      }
      eventQuery.value = baseQuery
      eventLogs.value = result.items
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      if (requestId !== activeEventRequestId || selectedServerName.value !== serverName) {
        return
      }
      requestState.setError(caughtError, '加载 MCP 事件日志失败')
    } finally {
      if (requestId === activeEventRequestId) {
        eventLoading.value = false
      }
    }
  }

  async function loadMoreServerEvents(
    query?: EventLogQuery,
    serverName = selectedServerName.value,
  ) {
    const baseQuery = readBaseMcpEventQuery(query ?? eventQuery.value)
    const cursor = query?.cursor ?? eventNextCursor.value
    if (!serverName || !cursor) {
      return
    }

    const requestId = ++activeEventRequestId
    eventLoading.value = true
    requestState.clearError()
    try {
      const result = await loadMcpServerEvents(serverName, {
        ...baseQuery,
        cursor,
      })
      if (requestId !== activeEventRequestId || selectedServerName.value !== serverName) {
        return
      }
      eventQuery.value = baseQuery
      eventLogs.value = dedupeMcpEventLogs([...eventLogs.value, ...result.items])
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      if (requestId !== activeEventRequestId || selectedServerName.value !== serverName) {
        return
      }
      requestState.setError(caughtError, '加载更多 MCP 事件日志失败')
    } finally {
      if (requestId === activeEventRequestId) {
        eventLoading.value = false
      }
    }
  }

  function clearServerEvents() {
    eventLogs.value = []
    eventNextCursor.value = null
  }

  return {
    loading,
    saving,
    savingEventLog,
    deleting,
    error,
    appError,
    snapshot,
    servers,
    selectedServerName,
    selectedServer,
    eventLoading,
    eventLogs,
    eventQuery,
    eventNextCursor,
    refresh,
    selectServer,
    createServer,
    updateServer,
    deleteServer,
    saveServerEventLog,
    refreshServerEvents,
    loadMoreServerEvents,
  }
}

function readBaseMcpEventQuery(query: EventLogQuery): EventLogQuery {
  const normalized = normalizeMcpEventQuery(query)
  const { cursor: _cursor, ...baseQuery } = normalized
  return baseQuery
}
