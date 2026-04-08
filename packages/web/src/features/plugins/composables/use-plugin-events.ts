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

export function usePluginEvents(options: UsePluginEventsOptions) {
  const eventLoading = ref(false)
  const eventLogs = shallowRef<PluginEventRecord[]>([])
  const eventQuery = shallowRef<PluginEventQuery>({
    limit: 50,
  })
  const eventNextCursor = ref<string | null>(null)

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    eventLogs.value = detail.eventResult.items
    eventNextCursor.value = detail.eventResult.nextCursor
  }

  function clearDetailState() {
    eventLogs.value = []
    eventNextCursor.value = null
  }

  async function refreshPluginEvents(query: PluginEventQuery = eventQuery.value) {
    if (!options.selectedPlugin.value) {
      eventLogs.value = []
      eventQuery.value = normalizeEventQuery(query)
      eventNextCursor.value = null
      return
    }

    eventLoading.value = true
    options.error.value = null
    try {
      const normalized = normalizeEventQuery(query)
      const result = await loadPluginEvents(options.selectedPlugin.value.name, normalized)
      eventQuery.value = normalized
      eventLogs.value = result.items
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '加载插件事件日志失败')
    } finally {
      eventLoading.value = false
    }
  }

  async function loadMorePluginEvents(query?: PluginEventQuery) {
    const normalized = normalizeEventQuery(query ?? eventQuery.value)
    const cursor = query?.cursor ?? eventNextCursor.value
    if (!options.selectedPlugin.value || !cursor) {
      return
    }

    eventLoading.value = true
    options.error.value = null
    try {
      const result = await loadPluginEvents(options.selectedPlugin.value.name, {
        ...normalized,
        cursor,
      })
      eventQuery.value = normalized
      eventLogs.value = dedupeEventLogs([...eventLogs.value, ...result.items])
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '加载更多插件事件日志失败')
    } finally {
      eventLoading.value = false
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
