import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type {
  PluginEventQuery,
  PluginEventRecord,
  PluginInfo,
} from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import {
  dedupeEventLogs,
  loadPluginEvents,
  normalizeEventQuery,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'

export interface UsePluginEventsOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  error: Ref<string | null>
}

const DEFAULT_EVENT_QUERY: PluginEventQuery = {
  limit: 50,
}

export function usePluginEvents(options: UsePluginEventsOptions) {
  const eventLoading = ref(false)
  const eventLogs = shallowRef<PluginEventRecord[]>([])
  const eventQuery = shallowRef<PluginEventQuery>(DEFAULT_EVENT_QUERY)
  const eventNextCursor = ref<string | null>(null)
  let activeEventRequestId = 0

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    eventLogs.value = detail.eventResult.items
    eventNextCursor.value = detail.eventResult.nextCursor
  }

  function clearDetailState() {
    eventLogs.value = []
    eventQuery.value = DEFAULT_EVENT_QUERY
    eventNextCursor.value = null
  }

  async function refreshPluginEvents(query: PluginEventQuery = eventQuery.value) {
    const pluginName = options.selectedPlugin.value?.name ?? null
    if (!pluginName) {
      eventLogs.value = []
      eventQuery.value = normalizeEventQuery(query)
      eventNextCursor.value = null
      return
    }

    const requestId = ++activeEventRequestId
    eventLoading.value = true
    options.error.value = null
    try {
      const normalized = normalizeEventQuery(query)
      const result = await loadPluginEvents(pluginName, normalized)
      if (requestId !== activeEventRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      eventQuery.value = normalized
      eventLogs.value = result.items
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      if (requestId !== activeEventRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      options.error.value = toErrorMessage(caughtError, '加载插件事件日志失败')
    } finally {
      if (requestId === activeEventRequestId) {
        eventLoading.value = false
      }
    }
  }

  async function loadMorePluginEvents(query?: PluginEventQuery) {
    const normalized = normalizeEventQuery(query ?? eventQuery.value)
    const cursor = query?.cursor ?? eventNextCursor.value
    const pluginName = options.selectedPlugin.value?.name ?? null
    if (!pluginName || !cursor) {
      return
    }

    const requestId = ++activeEventRequestId
    eventLoading.value = true
    options.error.value = null
    try {
      const result = await loadPluginEvents(pluginName, {
        ...normalized,
        cursor,
      })
      if (requestId !== activeEventRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      eventQuery.value = normalized
      eventLogs.value = dedupeEventLogs([...eventLogs.value, ...result.items])
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      if (requestId !== activeEventRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      options.error.value = toErrorMessage(caughtError, '加载更多插件事件日志失败')
    } finally {
      if (requestId === activeEventRequestId) {
        eventLoading.value = false
      }
    }
  }

  return {
    eventLoading,
    eventLogs,
    eventQuery,
    eventNextCursor,
    applyDetailSnapshot,
    clearDetailState,
    refreshPluginEvents,
    loadMorePluginEvents,
  }
}
