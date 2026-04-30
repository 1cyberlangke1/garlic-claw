import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { PluginCronJobSummary, PluginInfo } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
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
    if (!window.confirm(`确认删除定时任务 ${jobId} 吗？`)) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    deletingCronJobId.value = jobId
    options.error.value = null
    options.notice.value = null
    try {
      await deletePluginCronJob(pluginName, jobId)
      options.notice.value = '定时任务已删除'
      await options.refreshSelectedDetails(pluginName)
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
