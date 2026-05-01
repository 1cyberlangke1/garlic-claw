import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type {
  AiProviderSummary,
  EventLogSettings,
  PluginConfigSnapshot,
  PluginInfo,
  PluginLlmPreference,
  PluginRemoteDescriptor,
  PluginScopeSettings,
} from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/modules/plugins/composables/plugin-management.data'
import { useUiStore } from '@/shared/stores/ui'
import {
  savePluginConfig as savePluginConfigRequest,
  savePluginEventLog as savePluginEventLogRequest,
  savePluginLlmPreference as savePluginLlmPreferenceRequest,
  savePluginRemoteAccess as savePluginRemoteAccessRequest,
  savePluginScope as savePluginScopeRequest,
  type PluginLlmRouteOption,
  toErrorMessage,
} from '@/modules/plugins/composables/plugin-management.data'
import { emitPluginConfigChanged } from '@/modules/plugins/plugin-config-change'

export interface UsePluginConfigOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  error: Ref<string | null>
  notice: Ref<string | null>
  reloadPluginListSilently: () => Promise<void>
  refreshSelectedDetails: (pluginName?: string) => Promise<void>
}

export function usePluginConfig(options: UsePluginConfigOptions) {
  const uiStore = useUiStore()
  const savingConfig = ref(false)
  const savingLlmPreference = ref(false)
  const savingRemoteAccess = ref(false)
  const savingScope = ref(false)
  const savingEventLog = ref(false)
  const configSnapshot = shallowRef<PluginConfigSnapshot | null>(null)
  const llmPreference = shallowRef<PluginLlmPreference | null>(null)
  const llmProviders = shallowRef<AiProviderSummary[]>([])
  const llmOptions = shallowRef<PluginLlmRouteOption[]>([])
  const scopeSettings = shallowRef<PluginScopeSettings | null>(null)

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    configSnapshot.value = detail.configSnapshot
    llmPreference.value = detail.llmPreference
    llmProviders.value = detail.llmProviders
    llmOptions.value = detail.llmOptions
    scopeSettings.value = detail.scopeSettings
  }

  function clearDetailState() {
    configSnapshot.value = null
    llmPreference.value = null
    llmProviders.value = []
    llmOptions.value = []
    scopeSettings.value = null
  }

  async function saveConfig(values: PluginConfigSnapshot['values']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingConfig.value = true
    options.error.value = null
    try {
      configSnapshot.value = await savePluginConfigRequest(pluginName, values)
      emitPluginConfigChanged({ changeType: 'config', pluginName })
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('插件配置已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件配置失败')
    } finally {
      savingConfig.value = false
    }
  }

  async function saveLlmPreference(preference: PluginLlmPreference) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingLlmPreference.value = true
    options.error.value = null
    try {
      llmPreference.value = await savePluginLlmPreferenceRequest(pluginName, preference)
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('插件模型策略已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件模型策略失败')
    } finally {
      savingLlmPreference.value = false
    }
  }

  async function saveScope(conversations: PluginScopeSettings['conversations']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingScope.value = true
    options.error.value = null
    try {
      scopeSettings.value = await savePluginScopeRequest(pluginName, conversations)
      emitPluginConfigChanged({ changeType: 'scope', pluginName })
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('插件作用域已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件作用域失败')
    } finally {
      savingScope.value = false
    }
  }

  async function saveRemoteAccess(payload: {
    access: {
      accessKey: string | null
      serverUrl: string | null
    }
    description?: string
    displayName?: string
    remote: PluginRemoteDescriptor
    version?: string
  }) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingRemoteAccess.value = true
    options.error.value = null
    try {
      await savePluginRemoteAccessRequest(pluginName, payload)
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('远程接入配置已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存远程接入配置失败')
    } finally {
      savingRemoteAccess.value = false
    }
  }

  async function saveEventLog(settings: EventLogSettings) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingEventLog.value = true
    options.error.value = null
    try {
      await savePluginEventLogRequest(pluginName, settings)
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('插件日志设置已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件日志设置失败')
    } finally {
      savingEventLog.value = false
    }
  }

  return {
    savingConfig,
    savingEventLog,
    savingLlmPreference,
    savingRemoteAccess,
    savingScope,
    configSnapshot,
    llmPreference,
    llmProviders,
    llmOptions,
    scopeSettings,
    applyDetailSnapshot,
    clearDetailState,
    saveConfig,
    saveEventLog,
    saveLlmPreference,
    saveRemoteAccess,
    saveScope,
  }
}
