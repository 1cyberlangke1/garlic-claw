import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type {
  PluginConfigSnapshot,
  PluginInfo,
  PluginScopeSettings,
} from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import {
  savePluginConfig as savePluginConfigRequest,
  savePluginScope as savePluginScopeRequest,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'

export interface UsePluginConfigOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  error: Ref<string | null>
  notice: Ref<string | null>
  reloadPluginListSilently: () => Promise<void>
  refreshSelectedDetails: (pluginName?: string) => Promise<void>
}

export function usePluginConfig(options: UsePluginConfigOptions) {
  const savingConfig = ref(false)
  const savingScope = ref(false)
  const configSnapshot = shallowRef<PluginConfigSnapshot | null>(null)
  const scopeSettings = shallowRef<PluginScopeSettings | null>(null)

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    configSnapshot.value = detail.configSnapshot
    scopeSettings.value = detail.scopeSettings
  }

  function clearDetailState() {
    configSnapshot.value = null
    scopeSettings.value = null
  }

  async function saveConfig(values: PluginConfigSnapshot['values']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingConfig.value = true
    options.error.value = null
    options.notice.value = null
    try {
      configSnapshot.value = await savePluginConfigRequest(pluginName, values)
      options.notice.value = '插件配置已保存'
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件配置失败')
    } finally {
      savingConfig.value = false
    }
  }

  async function saveScope(conversations: PluginScopeSettings['conversations']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingScope.value = true
    options.error.value = null
    options.notice.value = null
    try {
      scopeSettings.value = await savePluginScopeRequest(pluginName, conversations)
      options.notice.value = '插件作用域已保存'
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件作用域失败')
    } finally {
      savingScope.value = false
    }
  }

  return {
    savingConfig,
    savingScope,
    configSnapshot,
    scopeSettings,
    applyDetailSnapshot,
    clearDetailState,
    saveConfig,
    saveScope,
  }
}
