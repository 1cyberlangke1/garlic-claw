import { ref, type Ref } from 'vue'
import type { PluginEventQuery } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import { usePluginConfig } from '@/features/plugins/composables/use-plugin-config'
import { usePluginCrons } from '@/features/plugins/composables/use-plugin-crons'
import { usePluginEvents } from '@/features/plugins/composables/use-plugin-events'
import { usePluginList } from '@/features/plugins/composables/use-plugin-list'
import { usePluginStorage } from '@/features/plugins/composables/use-plugin-storage'

/**
 * 插件管理兼容模块。
 * 负责组合细粒度 composable，并维持旧的 usePluginManagement API。
 */
export function createPluginManagementModule(options?: {
  preferredPluginName?: Ref<string | null>
}) {
  const detailLoading = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const defaultEventQuery: PluginEventQuery = {
    limit: 50,
  }

  let getCurrentEventQuery = () => defaultEventQuery
  let getCurrentStoragePrefix = () => ''
  let applyDetailSnapshot = (
    _detail: PluginDetailSnapshot,
    _pluginName: string,
  ) => {}
  let clearDetailState = () => {}

  const pluginList = usePluginList({
    preferredPluginName: options?.preferredPluginName,
    detailLoading,
    error,
    notice,
    getEventQuery: () => getCurrentEventQuery(),
    getStoragePrefix: () => getCurrentStoragePrefix(),
    applyDetailSnapshot: (detail, pluginName) => applyDetailSnapshot(detail, pluginName),
    clearDetailState: () => clearDetailState(),
  })

  const pluginConfig = usePluginConfig({
    selectedPlugin: pluginList.selectedPlugin,
    error,
    notice,
    reloadPluginListSilently: pluginList.reloadPluginListSilently,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
  })
  const pluginEvents = usePluginEvents({
    selectedPlugin: pluginList.selectedPlugin,
    error,
  })
  const pluginStorage = usePluginStorage({
    selectedPlugin: pluginList.selectedPlugin,
    detailLoading,
    error,
    notice,
  })
  const pluginCrons = usePluginCrons({
    selectedPlugin: pluginList.selectedPlugin,
    error,
    notice,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
  })

  getCurrentEventQuery = () => pluginEvents.eventQuery.value
  getCurrentStoragePrefix = () => pluginStorage.storagePrefix.value
  applyDetailSnapshot = (detail) => {
    pluginConfig.applyDetailSnapshot(detail)
    pluginCrons.applyDetailSnapshot(detail)
    pluginEvents.applyDetailSnapshot(detail)
    pluginStorage.applyDetailSnapshot(detail)
  }
  clearDetailState = () => {
    pluginList.clearDetailState()
    pluginConfig.clearDetailState()
    pluginCrons.clearDetailState()
    pluginEvents.clearDetailState()
    pluginStorage.clearDetailState()
  }

  return {
    loading: pluginList.loading,
    detailLoading,
    savingConfig: pluginConfig.savingConfig,
    savingStorage: pluginStorage.savingStorage,
    savingScope: pluginConfig.savingScope,
    eventLoading: pluginEvents.eventLoading,
    runningAction: pluginList.runningAction,
    deletingCronJobId: pluginCrons.deletingCronJobId,
    finishingConversationId: pluginList.finishingConversationId,
    deletingStorageKey: pluginStorage.deletingStorageKey,
    deleting: pluginList.deleting,
    error,
    notice,
    plugins: pluginList.plugins,
    selectedPluginName: pluginList.selectedPluginName,
    selectedPlugin: pluginList.selectedPlugin,
    configSnapshot: pluginConfig.configSnapshot,
    conversationSessions: pluginList.conversationSessions,
    cronJobs: pluginCrons.cronJobs,
    scopeSettings: pluginConfig.scopeSettings,
    healthSnapshot: pluginList.healthSnapshot,
    eventLogs: pluginEvents.eventLogs,
    eventQuery: pluginEvents.eventQuery,
    eventNextCursor: pluginEvents.eventNextCursor,
    storageEntries: pluginStorage.storageEntries,
    storagePrefix: pluginStorage.storagePrefix,
    canDeleteSelected: pluginList.canDeleteSelected,
    refreshAll: pluginList.refreshAll,
    selectPlugin: pluginList.selectPlugin,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
    refreshPluginEvents: pluginEvents.refreshPluginEvents,
    loadMorePluginEvents: pluginEvents.loadMorePluginEvents,
    refreshPluginStorage: pluginStorage.refreshPluginStorage,
    deleteCronJob: pluginCrons.deleteCronJob,
    finishConversationSession: pluginList.finishConversationSession,
    saveConfig: pluginConfig.saveConfig,
    saveStorageEntry: pluginStorage.saveStorageEntry,
    saveScope: pluginConfig.saveScope,
    runAction: pluginList.runAction,
    deleteStorageEntry: pluginStorage.deleteStorageEntry,
    deleteSelectedPlugin: pluginList.deleteSelectedPlugin,
  }
}
