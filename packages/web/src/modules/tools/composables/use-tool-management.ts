import { createToolManagementModule } from '@/modules/tools/modules/tool-management.module'

export function useToolManagement() {
  return createToolManagementModule()
}
