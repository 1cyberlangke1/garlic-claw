import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { PluginCronJobSummary, PluginInfo } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import { useUiStore } from '@/stores/ui'
import {
  deletePluginCronJob,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'

export interface UsePluginCronsOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  error: Ref<string | null>
  notice: Ref<string | null>
  refreshSelectedDetails: (pluginName?: string) => Promise<void>
}

export function usePluginCrons(options: UsePluginCronsOptions) {
  const uiStore = useUiStore()
  const deletingCronJobId = ref<string | null>(null)
  const cronJobs = shallowRef<PluginCronJobSummary[]>([])

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    cronJobs.value = detail.cronJobs
  }

  function clearDetailState() {
    cronJobs.value = []
  }

  async function deleteCronJob(jobId: string) {
    if (!options.selectedPlugin.value) {
      return
    }
    try {
      await ElMessageBox.confirm(
        `确认删除定时任务 ${jobId} 吗？`,
        '删除定时任务',
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
    deletingCronJobId.value = jobId
    options.error.value = null
    try {
      await deletePluginCronJob(pluginName, jobId)
      await options.refreshSelectedDetails(pluginName)
      uiStore.notify('定时任务已删除')
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '删除定时任务失败')
    } finally {
      deletingCronJobId.value = null
    }
  }

  return {
    deletingCronJobId,
    cronJobs,
    applyDetailSnapshot,
    clearDetailState,
    deleteCronJob,
  }
}
