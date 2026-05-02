<template>
  <ConsolePage class="mcp-page">
    <template #header>
      <ConsoleViewHeader
        v-model="currentView"
        :title="currentView === 'manage' ? 'MCP 管理' : 'MCP 日志'"
        :icon="currentView === 'manage' ? widgetAddBold : listCheckBold"
        :view-options="viewOptions"
        aria-label="MCP 视图切换"
      />
    </template>

    <McpConfigPanel :view="currentView" />
  </ConsolePage>
</template>

<script setup lang="ts">
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import { ref } from 'vue'
import ConsolePage from '@/shared/components/ConsolePage.vue'
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

</style>
