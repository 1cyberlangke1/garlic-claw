<template>
  <section class="hero-shell">
    <header class="page-header">
      <div class="hero-copy">
        <h1><Icon :icon="widgetBold" class="hero-icon" aria-hidden="true" />插件管理</h1>
      </div>
      <button type="button" class="hero-action" title="刷新全部" @click="$emit('refresh')">
        <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
      </button>
    </header>

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
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'

defineProps<{
  headline: string
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
.hero-shell {
  display: grid;
  gap: 14px;
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 18px;
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.hero-copy {
  display: grid;
  gap: 12px;
}

.hero-kicker,
.overview-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.hero-kicker {
  color: var(--accent);
}

.page-header p {
  color: var(--text-muted);
  max-width: 60ch;
}

.hero-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #63c7cd, #4f9ee8);
  box-shadow: 0 12px 28px rgba(52, 116, 168, 0.28);
}

.refresh-icon {
  width: 20px;
  height: 20px;
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
  .page-header,
  .overview-grid {
    grid-template-columns: 1fr;
  }

  .hero-action {
    width: 100%;
  }
}
</style>
