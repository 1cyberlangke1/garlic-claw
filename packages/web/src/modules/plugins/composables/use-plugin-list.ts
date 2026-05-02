import { computed, onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type {
  PluginActionName,
  PluginConversationSessionInfo,
  PluginEventQuery,
  PluginHealthSnapshot,
  PluginInfo,
} from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/modules/plugins/composables/plugin-management.data'
import { subscribeInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'
import { useUiStore } from '@/shared/stores/ui'
import {
  deletePluginRecord,
  finishPluginConversation,
  loadPluginDetailSnapshot,
  loadPlugins,
  runPluginActionRequest,
  toErrorMessage,
} from '@/modules/plugins/composables/plugin-management.data'
import { pickDefaultPluginName } from '@/modules/plugins/composables/plugin-management.helpers'

export interface UsePluginListOptions {
  preferredPluginName?: Ref<string | null>
  detailLoading: Ref<boolean>
  error: Ref<string | null>
  notice: Ref<string | null>
  getEventQuery: () => PluginEventQuery
  getStoragePrefix: () => string
  applyDetailSnapshot: (
    detail: PluginDetailSnapshot,
    pluginName: string,
  ) => void
  clearDetailState: () => void
}

export function usePluginList(options: UsePluginListOptions) {
  const uiStore = useUiStore()
  const loading = ref(false)
  const runningAction = ref<PluginActionName | null>(null)
  const finishingConversationId = ref<string | null>(null)
  const deleting = ref(false)
  const plugins = shallowRef<PluginInfo[]>([])
  const selectedPluginName = ref<string | null>(null)
  const conversationSessions = shallowRef<PluginConversationSessionInfo[]>([])
  const healthSnapshot = shallowRef<PluginHealthSnapshot | null>(null)
  let activeDetailRequestId = 0
  let appliedDetailPluginName: string | null = null

  const selectedPlugin = computed<PluginInfo | null>(() => {
    const found = plugins.value.find(
      (plugin) => plugin.name === selectedPluginName.value,
    )
    return found ?? null
  })

  const canDeleteSelected = computed<boolean>(() => {
    if (!selectedPlugin.value) {
      return false
    }

    return !selectedPlugin.value.connected && selectedPlugin.value.status !== 'online'
  })

  onMounted(() => {
    void refreshAll()
  })
  const unsubscribeInternalConfigChanged = subscribeInternalConfigChanged(({ scope }) => {
    if (scope !== 'provider-models' || !selectedPluginName.value) {
      return
    }
    void refreshSelectedDetails(selectedPluginName.value)
  })
  onUnmounted(() => {
    unsubscribeInternalConfigChanged()
  })

  if (options.preferredPluginName) {
    watch(options.preferredPluginName, async (pluginName) => {
      if (!pluginName || pluginName === selectedPluginName.value) {
        return
      }
      if (!plugins.value.some((plugin) => plugin.name === pluginName)) {
        return
      }

      await selectPlugin(pluginName)
    })
  }

  async function refreshAll() {
    loading.value = true
    options.error.value = null
    try {
      const nextPlugins = await loadPlugins()
      plugins.value = nextPlugins
      const fallbackName = pickDefaultPluginName({
        plugins: nextPlugins,
        currentPluginName: selectedPluginName.value,
        preferredPluginName: options.preferredPluginName?.value ?? null,
      })
      const fallback = fallbackName
        ? nextPlugins.find((plugin) => plugin.name === fallbackName) ?? null
        : null
      selectedPluginName.value = fallbackName

      if (fallback) {
        await refreshSelectedDetails(fallback.name)
      } else {
        appliedDetailPluginName = null
        options.clearDetailState()
      }
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '加载插件失败')
    } finally {
      loading.value = false
    }
  }

  async function selectPlugin(pluginName: string) {
    selectedPluginName.value = pluginName
    await refreshSelectedDetails(pluginName)
  }

  async function refreshSelectedDetails(
    pluginName = selectedPluginName.value ?? undefined,
  ) {
    if (!pluginName) {
      appliedDetailPluginName = null
      options.clearDetailState()
      return
    }

    const requestId = ++activeDetailRequestId
    if (selectedPluginName.value === pluginName && appliedDetailPluginName !== pluginName) {
      clearDetailState()
      options.clearDetailState()
    }
    options.detailLoading.value = true
    options.error.value = null
    try {
      const detail = await loadPluginDetailSnapshot(
        pluginName,
        options.getEventQuery(),
        options.getStoragePrefix(),
      )
      if (requestId !== activeDetailRequestId || selectedPluginName.value !== pluginName) {
        return
      }
      appliedDetailPluginName = pluginName
      conversationSessions.value = detail.conversationSessions
      healthSnapshot.value = detail.healthSnapshot
      updatePluginSummary(pluginName, {
        health: detail.healthSnapshot,
      })
      options.applyDetailSnapshot(detail, pluginName)
    } catch (caughtError) {
      if (requestId !== activeDetailRequestId || selectedPluginName.value !== pluginName) {
        return
      }
      options.error.value = toErrorMessage(caughtError, '加载插件详情失败')
    } finally {
      if (requestId === activeDetailRequestId) {
        options.detailLoading.value = false
      }
    }
  }

  async function finishConversationSession(conversationId: string) {
    if (!selectedPlugin.value) {
      return
    }
    try {
      await ElMessageBox.confirm(
        `确认结束会话等待态 ${conversationId} 吗？`,
        '结束会话等待态',
        {
          type: 'warning',
          confirmButtonText: '确认结束',
          cancelButtonText: '取消',
          autofocus: false,
        },
      )
    } catch {
      return
    }

    const pluginName = selectedPlugin.value.name
    finishingConversationId.value = conversationId
    options.error.value = null
    try {
      await finishPluginConversation(pluginName, conversationId)
      await refreshSelectedDetails(pluginName)
      uiStore.notify('会话等待态已结束')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '结束会话等待态失败')
    } finally {
      finishingConversationId.value = null
    }
  }

  async function runAction(action: PluginActionName) {
    if (!selectedPlugin.value) {
      return
    }

    const pluginName = selectedPlugin.value.name
    runningAction.value = action
    options.error.value = null
    try {
      const result = await runPluginActionRequest(pluginName, action)
      await reloadPluginListSilently()
      if (selectedPluginName.value) {
        await refreshSelectedDetails(selectedPluginName.value)
      } else {
        appliedDetailPluginName = null
        clearDetailState()
        options.clearDetailState()
      }
      uiStore.notify(result.message)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '执行插件动作失败')
    } finally {
      runningAction.value = null
    }
  }

  async function deleteSelectedPlugin() {
    if (!selectedPlugin.value || !canDeleteSelected.value) {
      return
    }
    try {
      await ElMessageBox.confirm(
        `确认删除插件记录 ${selectedPlugin.value.name} 吗？`,
        '删除插件记录',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          autofocus: false,
        },
      )
    } catch {
      return
    }

    const currentName = selectedPlugin.value.name
    deleting.value = true
    options.error.value = null
    try {
      await deletePluginRecord(currentName)
      await refreshAll()
      if (selectedPluginName.value === currentName) {
        selectedPluginName.value = plugins.value[0]?.name ?? null
      }
      uiStore.notify('插件记录已删除')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '删除插件记录失败')
    } finally {
      deleting.value = false
    }
  }

  function clearDetailState() {
    conversationSessions.value = []
    healthSnapshot.value = null
  }

  async function reloadPluginListSilently() {
    const currentPluginName = selectedPluginName.value
    const nextPlugins = await loadPlugins()
    plugins.value = nextPlugins
    selectedPluginName.value = pickDefaultPluginName({
      plugins: nextPlugins,
      currentPluginName,
      preferredPluginName: options.preferredPluginName?.value ?? null,
    })
    if (!selectedPluginName.value) {
      appliedDetailPluginName = null
      clearDetailState()
      options.clearDetailState()
    }
  }

  function updatePluginSummary(pluginName: string, patch: Partial<PluginInfo>) {
    plugins.value = plugins.value.map((plugin) => plugin.name === pluginName
      ? {
        ...plugin,
        ...patch,
      }
      : plugin)
  }

  return {
    loading,
    runningAction,
    finishingConversationId,
    deleting,
    plugins,
    selectedPluginName,
    selectedPlugin,
    conversationSessions,
    healthSnapshot,
    canDeleteSelected,
    refreshAll,
    selectPlugin,
    refreshSelectedDetails,
    finishConversationSession,
    runAction,
    deleteSelectedPlugin,
    clearDetailState,
    reloadPluginListSilently,
    updatePluginSummary,
  }
}
