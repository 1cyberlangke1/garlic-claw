<template>
  <ConsoleViewHeader
    title="插件管理"
    :icon="widgetBold"
  >
    <template #actions>
      <ElButton class="hero-action view-header-action" title="刷新全部" @click="$emit('refresh')">
        <Icon :icon="refreshBold" class="refresh-icon view-header-action-icon" aria-hidden="true" />
      </ElButton>
    </template>

    <div class="overview-grid">
      <article
        v-for="card in cards"
        :key="card.label"
        class="overview-card"
        :class="card.tone"
      >
        <div class="overview-card-head">
          <span class="overview-label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </div>
        <p>{{ card.note }}</p>
      </article>
    </div>
  </ConsoleViewHeader>
</template>

<script setup lang="ts">
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import { Icon } from '@iconify/vue'
import { ElButton } from 'element-plus'

defineProps<{
  cards: Array<{
    label: string
    value: string
    note: string
    tone: string
  }>
}>()

defineEmits<{
  (event: 'refresh'): void
}>()
</script>

<style scoped>
.overview-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero-action {
  width: 36px;
  min-width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-panel-hover-soft);
  color: var(--text);
}

.hero-action:hover:not(:disabled) {
  background: var(--surface-panel-muted-strong);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}

.overview-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.overview-card {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 6px;
  min-width: 0;
  height: 72px;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-card-gradient);
  overflow: hidden;
}

.overview-card strong {
  font-size: clamp(1.15rem, 1.6vw, 1.55rem);
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.overview-label {
  color: var(--text-muted);
}

.overview-card p {
  color: var(--text-muted);
  font-size: 0.78rem;
  overflow: hidden;
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
