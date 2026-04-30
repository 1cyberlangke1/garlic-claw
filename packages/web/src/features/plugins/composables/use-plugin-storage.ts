import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { PluginInfo, PluginStorageEntry } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import {
  deletePluginStorageEntry as deletePluginStorageEntryRequest,
  loadPluginStorage,
  savePluginStorageEntry as savePluginStorageEntryRequest,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'

export interface UsePluginStorageOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  detailLoading: Ref<boolean>
  error: Ref<string | null>
  notice: Ref<string | null>
}

export function usePluginStorage(options: UsePluginStorageOptions) {
  const savingStorage = ref(false)
  const deletingStorageKey = ref<string | null>(null)
  const storageEntries = shallowRef<PluginStorageEntry[]>([])
  const storagePrefix = ref('')

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    storageEntries.value = detail.storageEntries
  }

  function clearDetailState() {
    storageEntries.value = []
  }

  async function refreshPluginStorage(prefix = storagePrefix.value) {
    if (!options.selectedPlugin.value) {
      storageEntries.value = []
      storagePrefix.value = ''
      return
    }

    options.detailLoading.value = true
    options.error.value = null
    try {
      storagePrefix.value = prefix.trim()
      storageEntries.value = await loadPluginStorage(
        options.selectedPlugin.value.name,
        storagePrefix.value,
      )
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '加载插件 KV 失败')
    } finally {
      options.detailLoading.value = false
    }
  }

  async function saveStorageEntry(entry: PluginStorageEntry) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingStorage.value = true
    options.error.value = null
    options.notice.value = null
    try {
      await savePluginStorageEntryRequest(pluginName, entry)
      options.notice.value = '插件 KV 已保存'
      await refreshPluginStorage(storagePrefix.value)
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
    options.notice.value = null
    try {
      await deletePluginStorageEntryRequest(pluginName, key)
      options.notice.value = '插件 KV 已删除'
      await refreshPluginStorage(storagePrefix.value)
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
