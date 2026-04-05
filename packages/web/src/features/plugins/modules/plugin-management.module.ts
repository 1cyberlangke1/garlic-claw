import { computed, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type {
  PluginActionName,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginCronJobSummary,
  PluginEventRecord,
  PluginEventQuery,
  PluginHealthSnapshot,
  PluginInfo,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared'
import {
  deletePluginCronJob,
  deletePluginRecord,
  deletePluginStorageEntry as deletePluginStorageEntryRequest,
  dedupeEventLogs,
  finishPluginConversation,
  loadPluginDetailSnapshot,
  loadPluginEvents,
  loadPluginStorage,
  loadPlugins,
  normalizeEventQuery,
  runPluginActionRequest,
  savePluginConfig as savePluginConfigRequest,
  savePluginScope as savePluginScopeRequest,
  savePluginStorageEntry as savePluginStorageEntryRequest,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'
import { pickDefaultPluginName } from '@/features/plugins/composables/plugin-management.helpers'

/**
 * 插件管理页的状态与行为收口。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - 插件列表、详情、治理动作与保存操作所需的响应式状态和函数
 * 预期行为:
 * - 页面只负责渲染
 * - 所有插件管理数据拉取与保存逻辑集中到此 composable
 */
export function createPluginManagementModule(options?: {
  preferredPluginName?: Ref<string | null>
}) {
  const loading = ref(false)
  const detailLoading = ref(false)
  const savingConfig = ref(false)
  const savingStorage = ref(false)
  const savingScope = ref(false)
  const eventLoading = ref(false)
  const runningAction = ref<PluginActionName | null>(null)
  const deletingCronJobId = ref<string | null>(null)
  const finishingConversationId = ref<string | null>(null)
  const deletingStorageKey = ref<string | null>(null)
  const deleting = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const plugins = shallowRef<PluginInfo[]>([])
  const selectedPluginName = ref<string | null>(null)
  const configSnapshot = shallowRef<PluginConfigSnapshot | null>(null)
  const conversationSessions = shallowRef<PluginConversationSessionInfo[]>([])
  const cronJobs = shallowRef<PluginCronJobSummary[]>([])
  const scopeSettings = shallowRef<PluginScopeSettings | null>(null)
  const healthSnapshot = shallowRef<PluginHealthSnapshot | null>(null)
  const eventLogs = shallowRef<PluginEventRecord[]>([])
  const storageEntries = shallowRef<PluginStorageEntry[]>([])
  const storagePrefix = ref('')
  const eventQuery = shallowRef<PluginEventQuery>({
    limit: 50,
  })
  const eventNextCursor = ref<string | null>(null)

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

  if (options?.preferredPluginName) {
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

  /**
   * 刷新插件列表，并尽量保持当前选中项。
   */
  async function refreshAll() {
    loading.value = true
    error.value = null
    try {
      const nextPlugins = await loadPlugins()
      plugins.value = nextPlugins
      const fallbackName = pickDefaultPluginName({
        plugins: nextPlugins,
        currentPluginName: selectedPluginName.value,
        preferredPluginName: options?.preferredPluginName?.value ?? null,
      })
      const fallback = fallbackName
        ? nextPlugins.find((plugin) => plugin.name === fallbackName) ?? null
        : null
      selectedPluginName.value = fallbackName

      if (fallback) {
        await refreshSelectedDetails(fallback.name)
      } else {
        clearDetails()
      }
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 切换当前选中的插件，并刷新右侧详情。
   * @param pluginName 插件 ID
   */
  async function selectPlugin(pluginName: string) {
    selectedPluginName.value = pluginName
    await refreshSelectedDetails(pluginName)
  }

  /**
   * 仅刷新当前选中插件的详情区域。
   * @param pluginName 可选插件 ID；缺省时使用当前选中项
   */
  async function refreshSelectedDetails(pluginName = selectedPluginName.value ?? undefined) {
    if (!pluginName) {
      clearDetails()
      return
    }

    detailLoading.value = true
    error.value = null
    try {
      const detail = await loadPluginDetailSnapshot(
        pluginName,
        eventQuery.value,
        storagePrefix.value,
      )
      configSnapshot.value = detail.configSnapshot
      conversationSessions.value = detail.conversationSessions
      cronJobs.value = detail.cronJobs
      scopeSettings.value = detail.scopeSettings
      healthSnapshot.value = detail.healthSnapshot
      updatePluginSummary(pluginName, {
        health: detail.healthSnapshot,
      })
      eventLogs.value = detail.eventResult.items
      eventNextCursor.value = detail.eventResult.nextCursor
      storageEntries.value = detail.storageEntries
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件详情失败')
    } finally {
      detailLoading.value = false
    }
  }

  /**
   * 按当前筛选条件刷新插件事件日志。
   * @param query 可选查询条件
   */
  async function refreshPluginEvents(query: PluginEventQuery = eventQuery.value) {
    if (!selectedPlugin.value) {
      eventLogs.value = []
      eventQuery.value = normalizeEventQuery(query)
      eventNextCursor.value = null
      return
    }

    eventLoading.value = true
    error.value = null
    try {
      const normalized = normalizeEventQuery(query)
      const result = await loadPluginEvents(selectedPlugin.value.name, normalized)
      eventQuery.value = normalized
      eventLogs.value = result.items
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件事件日志失败')
    } finally {
      eventLoading.value = false
    }
  }

  /**
   * 继续加载下一页插件事件日志。
   * @param query 可选分页查询；缺省时使用当前状态
   */
  async function loadMorePluginEvents(query?: PluginEventQuery) {
    const normalized = normalizeEventQuery(query ?? eventQuery.value)
    const cursor = query?.cursor ?? eventNextCursor.value
    if (!selectedPlugin.value || !cursor) {
      return
    }

    eventLoading.value = true
    error.value = null
    try {
      const result = await loadPluginEvents(selectedPlugin.value.name, {
        ...normalized,
        cursor,
      })
      eventQuery.value = normalized
      eventLogs.value = dedupeEventLogs([...eventLogs.value, ...result.items])
      eventNextCursor.value = result.nextCursor
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载更多插件事件日志失败')
    } finally {
      eventLoading.value = false
    }
  }

  /**
   * 保存当前插件配置，并刷新列表与详情。
   * @param values 新配置值
   */
  async function saveConfig(values: PluginConfigSnapshot['values']) {
    if (!selectedPlugin.value) {
      return
    }

    savingConfig.value = true
    error.value = null
    notice.value = null
    try {
      configSnapshot.value = await savePluginConfigRequest(
        selectedPlugin.value.name,
        values,
      )
      notice.value = '插件配置已保存'
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '保存插件配置失败')
    } finally {
      savingConfig.value = false
    }
  }

  /**
   * 按当前前缀刷新插件持久化 KV 列表。
   * @param prefix 可选键前缀
   */
  async function refreshPluginStorage(prefix = storagePrefix.value) {
    if (!selectedPlugin.value) {
      storageEntries.value = []
      storagePrefix.value = ''
      return
    }

    detailLoading.value = true
    error.value = null
    try {
      storagePrefix.value = prefix.trim()
      storageEntries.value = await loadPluginStorage(
        selectedPlugin.value.name,
        storagePrefix.value,
      )
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件 KV 失败')
    } finally {
      detailLoading.value = false
    }
  }

  /**
   * 保存一个插件持久化 KV 条目。
   * @param entry 待保存的键值对
   */
  async function saveStorageEntry(entry: PluginStorageEntry) {
    if (!selectedPlugin.value) {
      return
    }

    savingStorage.value = true
    error.value = null
    notice.value = null
    try {
      await savePluginStorageEntryRequest(selectedPlugin.value.name, entry)
      notice.value = '插件 KV 已保存'
      await refreshPluginStorage(storagePrefix.value)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '保存插件 KV 失败')
    } finally {
      savingStorage.value = false
    }
  }

  /**
   * 删除一个插件持久化 KV 条目。
   * @param key 待删除键名
   */
  async function deleteStorageEntry(key: string) {
    if (!selectedPlugin.value) {
      return
    }
    if (!window.confirm(`确认删除插件 KV ${key} 吗？`)) {
      return
    }

    deletingStorageKey.value = key
    error.value = null
    notice.value = null
    try {
      await deletePluginStorageEntryRequest(selectedPlugin.value.name, key)
      notice.value = '插件 KV 已删除'
      await refreshPluginStorage(storagePrefix.value)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '删除插件 KV 失败')
    } finally {
      deletingStorageKey.value = null
    }
  }

  /**
   * 删除一个 host 来源的 cron job。
   * @param jobId 待删除 job ID
   */
  async function deleteCronJob(jobId: string) {
    if (!selectedPlugin.value) {
      return
    }
    if (!window.confirm(`确认删除 cron job ${jobId} 吗？`)) {
      return
    }

    deletingCronJobId.value = jobId
    error.value = null
    notice.value = null
    try {
      await deletePluginCronJob(selectedPlugin.value.name, jobId)
      notice.value = 'Cron job 已删除'
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '删除 cron job 失败')
    } finally {
      deletingCronJobId.value = null
    }
  }

  /**
   * 强制结束当前插件的一条活动会话等待态。
   * @param conversationId 待结束的会话 ID
   */
  async function finishConversationSession(conversationId: string) {
    if (!selectedPlugin.value) {
      return
    }
    if (!window.confirm(`确认结束会话等待态 ${conversationId} 吗？`)) {
      return
    }

    finishingConversationId.value = conversationId
    error.value = null
    notice.value = null
    try {
      await finishPluginConversation(selectedPlugin.value.name, conversationId)
      notice.value = '会话等待态已结束'
      conversationSessions.value = (
        await loadPluginDetailSnapshot(
          selectedPlugin.value.name,
          eventQuery.value,
          storagePrefix.value,
        )
      ).conversationSessions
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '结束会话等待态失败')
    } finally {
      finishingConversationId.value = null
    }
  }

  /**
   * 保存当前插件作用域设置，并刷新列表与详情。
   * @param scope 新作用域设置
   */
  async function saveScope(conversations: PluginScopeSettings['conversations']) {
    if (!selectedPlugin.value) {
      return
    }

    savingScope.value = true
    error.value = null
    notice.value = null
    try {
      scopeSettings.value = await savePluginScopeRequest(
        selectedPlugin.value.name,
        conversations,
      )
      notice.value = '插件作用域已保存'
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '保存插件作用域失败')
    } finally {
      savingScope.value = false
    }
  }

  /**
   * 触发当前插件治理动作。
   * @param action 动作名称
   */
  async function runAction(action: PluginActionName) {
    if (!selectedPlugin.value) {
      return
    }

    runningAction.value = action
    error.value = null
    notice.value = null
    try {
      const result = await runPluginActionRequest(selectedPlugin.value.name, action)
      notice.value = result.message
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '执行插件动作失败')
    } finally {
      runningAction.value = null
    }
  }

  /**
   * 删除当前选中的离线插件记录。
   */
  async function deleteSelectedPlugin() {
    if (!selectedPlugin.value || !canDeleteSelected.value) {
      return
    }
    if (!window.confirm(`确认删除插件记录 ${selectedPlugin.value.name} 吗？`)) {
      return
    }

    deleting.value = true
    error.value = null
    notice.value = null
    try {
      const currentName = selectedPlugin.value.name
      await deletePluginRecord(currentName)
      notice.value = '插件记录已删除'
      await refreshAll()
      if (selectedPluginName.value === currentName) {
        selectedPluginName.value = plugins.value[0]?.name ?? null
      }
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '删除插件记录失败')
    } finally {
      deleting.value = false
    }
  }

  /**
   * 清空右侧详情区域。
   */
  function clearDetails() {
    configSnapshot.value = null
    conversationSessions.value = []
    cronJobs.value = []
    scopeSettings.value = null
    healthSnapshot.value = null
    eventLogs.value = []
    eventNextCursor.value = null
    storageEntries.value = []
  }

  /**
   * 静默刷新插件列表，不覆盖当前错误提示。
   */
  async function reloadPluginListSilently() {
    const nextPlugins = await loadPlugins()
    plugins.value = nextPlugins
  }

  /**
   * 回写单个插件在侧栏中的摘要信息。
   * @param pluginName 插件 ID
   * @param patch 需要覆盖的摘要字段
   */
  function updatePluginSummary(
    pluginName: string,
    patch: Partial<PluginInfo>,
  ) {
    plugins.value = plugins.value.map((plugin) => plugin.name === pluginName
      ? {
        ...plugin,
        ...patch,
      }
      : plugin)
  }

  return {
    loading,
    detailLoading,
    savingConfig,
    savingStorage,
    savingScope,
    eventLoading,
    runningAction,
    deletingCronJobId,
    finishingConversationId,
    deletingStorageKey,
    deleting,
    error,
    notice,
    plugins,
    selectedPluginName,
    selectedPlugin,
    configSnapshot,
    conversationSessions,
    cronJobs,
    scopeSettings,
    healthSnapshot,
    eventLogs,
    eventQuery,
    eventNextCursor,
    storageEntries,
    storagePrefix,
    canDeleteSelected,
    refreshAll,
    selectPlugin,
    refreshSelectedDetails,
    refreshPluginEvents,
    loadMorePluginEvents,
    refreshPluginStorage,
    deleteCronJob,
    finishConversationSession,
    saveConfig,
    saveStorageEntry,
    saveScope,
    runAction,
    deleteStorageEntry,
    deleteSelectedPlugin,
  }
}
