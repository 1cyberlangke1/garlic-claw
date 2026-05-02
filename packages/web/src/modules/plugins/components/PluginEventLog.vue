<template>
  <EventLogPanel
    title="事件日志"
    description="查看插件的事件记录。"
    :events="events"
    :loading="loading"
    :query="query"
    :next-cursor="nextCursor"
    @refresh="emit('refresh', $event)"
    @load-more="emit('loadMore', $event)"
  />
</template>

<script setup lang="ts">
import type { PluginEventQuery, PluginEventRecord } from '@garlic-claw/shared'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'

defineProps<{
  events: PluginEventRecord[]
  loading: boolean
  query: PluginEventQuery
  nextCursor: string | null
}>()

const emit = defineEmits<{
  refresh: [query: PluginEventQuery]
  loadMore: [query: PluginEventQuery]
}>()
</script>
