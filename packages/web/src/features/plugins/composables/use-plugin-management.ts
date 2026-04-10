import type { Ref } from 'vue'
import { createPluginManagementModule } from '@/features/plugins/modules/plugin-management.module'

/**
 * 兼容旧页面调用方式的插件管理入口。
 * 具体职责已拆分到细粒度 composable，由 module 负责聚合。
 */
export function usePluginManagement(options?: {
  preferredPluginName?: Ref<string | null>
}) {
  return createPluginManagementModule(options)
}
