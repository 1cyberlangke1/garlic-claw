<template>
  <div class="mcp-page">
    <ConsoleViewHeader
      v-model="currentView"
      :title="currentView === 'manage' ? 'MCP 管理' : 'MCP 日志'"
      :icon="currentView === 'manage' ? widgetAddBold : listCheckBold"
      :view-options="viewOptions"
      aria-label="MCP 视图切换"
    />

    <McpConfigPanel :view="currentView" />
  </div>
</template>

<script setup lang="ts">
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import { ref } from 'vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import McpConfigPanel from '@/modules/tools/components/McpConfigPanel.vue'

type McpPageView = 'manage' | 'logs'

const currentView = ref<McpPageView>('manage')
const viewOptions: ReadonlyArray<{ label: string; value: McpPageView }> = [
  { label: '管理', value: 'manage' },
  { label: '日志', value: 'logs' },
]
</script>

<style scoped>
.mcp-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
}

@media (max-width: 720px) {
  .mcp-page {
    padding: 1rem;
  }
}
</style>
