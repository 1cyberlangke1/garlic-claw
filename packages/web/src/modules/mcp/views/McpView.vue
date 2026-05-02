<template>
  <ConsolePage class="mcp-page">
    <template #header>
      <ConsoleViewHeader
        v-model="currentView"
        :title="currentView === 'manage' ? 'MCP 管理' : 'MCP 日志'"
        :icon="currentView === 'manage' ? widgetAddBold : listCheckBold"
        :view-options="viewOptions"
        aria-label="MCP 视图切换"
      >
        <template #actions>
          <ElButton
            v-if="currentView === 'logs' && panelRef?.selectedServer"
            class="view-header-action"
            :class="{ active: panelRef?.showLogSettings }"
            title="日志设置"
            @click="panelRef?.toggleLogSettings()"
          >
            <Icon :icon="settingsBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            class="view-header-action"
            :title="currentView === 'manage' ? '刷新配置' : '刷新日志'"
            :disabled="panelRef?.loading"
            @click="panelRef?.handleRefresh()"
          >
            <Icon :icon="refreshBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
          <ElButton
            v-if="currentView === 'manage'"
            class="view-header-action"
            title="新增 Server"
            @click="panelRef?.startCreate()"
          >
            <Icon :icon="addCircleBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <McpConfigPanel ref="panelRef" :view="currentView" />
  </ConsolePage>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import { Icon } from '@iconify/vue'
import { ElButton } from 'element-plus'
import type { McpServerConfig } from '@garlic-claw/shared'
import { ref } from 'vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import McpConfigPanel from '@/modules/tools/components/McpConfigPanel.vue'

type McpPageView = 'manage' | 'logs'
type McpConfigPanelExposed = {
  loading: boolean
  selectedServer: McpServerConfig | null
  showLogSettings: boolean
  startCreate: () => void
  handleRefresh: () => void
  toggleLogSettings: () => void
}

const currentView = ref<McpPageView>('manage')
const panelRef = ref<McpConfigPanelExposed | null>(null)
const viewOptions: ReadonlyArray<{ label: string; value: McpPageView }> = [
  { label: '管理', value: 'manage' },
  { label: '日志', value: 'logs' },
]
</script>

<style scoped>
.mcp-page :deep(.view-header-action.active) {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
}
</style>
