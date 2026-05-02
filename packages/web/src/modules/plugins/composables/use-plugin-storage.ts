import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { PluginInfo, PluginStorageEntry } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/modules/plugins/composables/plugin-management.data'
import { useUiStore } from '@/shared/stores/ui'
import {
  deletePluginStorageEntry as deletePluginStorageEntryRequest,
  loadPluginStorage,
  savePluginStorageEntry as savePluginStorageEntryRequest,
  toErrorMessage,
} from '@/modules/plugins/composables/plugin-management.data'

export interface UsePluginStorageOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  detailLoading: Ref<boolean>
  error: Ref<string | null>
  notice: Ref<string | null>
}

export function usePluginStorage(options: UsePluginStorageOptions) {
  const uiStore = useUiStore()
  const savingStorage = ref(false)
  const deletingStorageKey = ref<string | null>(null)
  const storageEntries = shallowRef<PluginStorageEntry[]>([])
  const storagePrefix = ref('')
  let activeStorageRequestId = 0

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    storageEntries.value = detail.storageEntries
  }

  function clearDetailState() {
    storageEntries.value = []
    storagePrefix.value = ''
  }

  async function refreshPluginStorage(prefix = storagePrefix.value) {
    const pluginName = options.selectedPlugin.value?.name ?? null
    if (!pluginName) {
      storageEntries.value = []
      storagePrefix.value = ''
      return
    }

    const requestId = ++activeStorageRequestId
    options.detailLoading.value = true
    options.error.value = null
    try {
      const normalizedPrefix = prefix.trim()
      const nextEntries = await loadPluginStorage(pluginName, normalizedPrefix)
      if (requestId !== activeStorageRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      storagePrefix.value = normalizedPrefix
      storageEntries.value = nextEntries
    } catch (caughtError) {
      if (requestId !== activeStorageRequestId || options.selectedPlugin.value?.name !== pluginName) {
        return
      }
      options.error.value = toErrorMessage(caughtError, '加载插件 KV 失败')
    } finally {
      if (requestId === activeStorageRequestId) {
        options.detailLoading.value = false
      }
    }
  }

  async function saveStorageEntry(entry: PluginStorageEntry) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingStorage.value = true
    options.error.value = null
    try {
      await savePluginStorageEntryRequest(pluginName, entry)
      await refreshPluginStorage(storagePrefix.value)
      uiStore.notify('插件 KV 已保存')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件 KV 失败')
    } finally {
      savingStorage.value = false
    }
  }

  async function deleteStorageEntry(key: string) {
    if (!options.selectedPlugin.value) {
      return
    }
    try {
      await ElMessageBox.confirm(
        `确认删除插件 KV ${key} 吗？`,
        '删除插件 KV',
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

    const pluginName = options.selectedPlugin.value.name
    deletingStorageKey.value = key
    options.error.value = null
    try {
      await deletePluginStorageEntryRequest(pluginName, key)
      await refreshPluginStorage(storagePrefix.value)
      uiStore.notify('插件 KV 已删除')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '删除插件 KV 失败')
    } finally {
      deletingStorageKey.value = null
    }
  }

  return {
    savingStorage,
    deletingStorageKey,
    storageEntries,
    storagePrefix,
    applyDetailSnapshot,
    clearDetailState,
    refreshPluginStorage,
    saveStorageEntry,
    deleteStorageEntry,
  }
}
