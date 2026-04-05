import { createToolManagementModule } from '@/features/tools/modules/tool-management.module'

export function useToolManagement() {
  return createToolManagementModule()
}
