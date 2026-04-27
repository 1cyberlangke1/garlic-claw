<template>
  <section class="panel-shell">
    <header class="panel-header">
      <div>
        <span class="panel-kicker">Context</span>
        <h2>上下文治理</h2>
        <p>这里直接配置自动标题与上下文压缩/滑动窗口；记忆已回到独立插件管理。</p>
      </div>
    </header>

    <SchemaConfigForm
      :snapshot="snapshot"
      :saving="saving"
      :show-header="false"
      @save="emit('save', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import type { PluginConfigSnapshot } from '@garlic-claw/shared'
import SchemaConfigForm from '@/features/config/components/SchemaConfigForm.vue'

defineProps<{
  snapshot: PluginConfigSnapshot | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', values: PluginConfigSnapshot['values']): void
}>()
</script>

<style scoped>
.panel-shell,
.panel-header {
  display: grid;
  gap: 14px;
}

.panel-shell {
  min-width: 0;
}

.panel-kicker {
  color: var(--accent);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-header h2,
.panel-header p {
  margin: 0;
}

.panel-header p {
  margin-top: 6px;
  color: var(--text-muted);
}
</style>
