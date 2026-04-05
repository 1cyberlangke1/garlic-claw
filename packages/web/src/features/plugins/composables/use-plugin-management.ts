import type { Ref } from 'vue'
import { createPluginManagementModule } from '@/features/plugins/modules/plugin-management.module'

export function usePluginManagement(options?: {
  preferredPluginName?: Ref<string | null>
}) {
  return createPluginManagementModule(options)
}
