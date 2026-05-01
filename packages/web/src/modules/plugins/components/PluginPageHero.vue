<template>
  <ConsoleViewHeader
    :model-value="currentView"
    :title="currentView === 'manage' ? '插件管理' : '插件日志'"
    :icon="currentView === 'manage' ? widgetBold : listCheckBold"
    :view-options="viewOptions"
    aria-label="插件管理视图切换"
    @update:model-value="handleViewUpdate"
  >
    <template #actions>
      <ElButton class="hero-action view-header-action" title="刷新全部" @click="$emit('refresh')">
        <Icon :icon="refreshBold" class="refresh-icon view-header-action-icon" aria-hidden="true" />
      </ElButton>
    </template>

    <div class="overview-grid">
      <article class="overview-card accent">
        <span class="overview-label">统一协议运行面</span>
        <strong>{{ headline }}</strong>
        <p>本地插件跟随后端启动，远程插件通过同一套宿主协议接入。</p>
      </article>
      <article
        v-for="card in cards"
        :key="card.label"
        class="overview-card"
        :class="card.tone"
      >
        <span class="overview-label">{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <p>{{ card.note }}</p>
      </article>
    </div>
  </ConsoleViewHeader>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import listCheckBold from '@iconify-icons/solar/list-check-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import { ElButton } from 'element-plus'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'

defineProps<{
  headline: string
  currentView: string
  viewOptions: ReadonlyArray<{
    label: string
    value: string
  }>
  cards: Array<{
    label: string
    value: string
    note: string
    tone: string
  }>
}>()

const emit = defineEmits<{
  (event: 'refresh'): void
  (event: 'update:currentView', value: string): void
}>()

function handleViewUpdate(value: string) {
  emit('update:currentView', value)
}
</script>

<style scoped>
.overview-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero-action {
  border-radius: 10px;
  background: linear-gradient(135deg, #63c7cd, #4f9ee8);
  box-shadow: 0 12px 28px rgba(52, 116, 168, 0.28);
}

.hero-action:hover:not(:disabled) {
  background: linear-gradient(135deg, #7ad8dc, #6cb5f1);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.overview-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 1.05rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-card-gradient);
}

.overview-card strong {
  font-size: clamp(1.35rem, 2vw, 1.85rem);
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.overview-label {
  color: var(--text-muted);
}

.overview-card p {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.overview-card.accent {
  border-color: rgba(103, 199, 207, 0.24);
}

.overview-card.warning {
  border-color: rgba(240, 198, 118, 0.28);
}

.overview-card.warning strong {
  color: #f5d38c;
}

.overview-card.spotlight strong {
  font-size: 1.25rem;
}

@media (max-width: 1280px) {
  .overview-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
