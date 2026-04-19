<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <div class="section-actions">
        <button
          type="button"
          class="ghost-button refresh-button"
          :data-test="refreshButtonTestId"
          title="刷新日志"
          :disabled="loading"
          @click="emitRefresh()"
        >
          <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="filter-grid">
      <label class="control-field">
        <span>最近</span>
        <select
          :value="selectedLimit"
          :data-test="limitSelectTestId"
          @change="handleLimitChange"
        >
          <option v-for="option in limitOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
      <label class="control-field">
        <span>级别</span>
        <select v-model="levelFilter" :data-test="levelFilterTestId">
          <option value="all">全部</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </label>
      <label class="control-field">
        <span>类型</span>
        <input
          v-model="typeFilter"
          :data-test="typeFilterTestId"
          type="text"
          placeholder="如 tool:error"
        >
      </label>
      <label class="control-field control-span">
        <span>关键词</span>
        <input
          v-model="searchFilter"
          :data-test="searchFilterTestId"
          type="text"
          placeholder="按 message / metadata 搜索"
        >
      </label>
    </div>

    <div v-if="loading && events.length === 0" class="section-empty">加载中...</div>
    <div v-else-if="events.length === 0 && hasActiveQueryFilters" class="section-empty">
      当前筛选下没有事件日志。
    </div>
    <div v-else-if="events.length === 0" class="section-empty">
      当前还没有事件日志。
    </div>
    <div v-else class="event-list">
      <article v-for="event in events" :key="event.id" class="event-item">
        <div class="event-top">
          <span class="event-level" :class="event.level">{{ event.level }}</span>
          <strong>{{ event.type }}</strong>
          <time>{{ formatTime(event.createdAt) }}</time>
        </div>
        <p>{{ event.message }}</p>
        <pre v-if="event.metadata" class="event-metadata">{{ JSON.stringify(event.metadata, null, 2) }}</pre>
      </article>
    </div>
    <button
      v-if="nextCursor"
      type="button"
      class="ghost-button load-more-button"
      :data-test="loadMoreButtonTestId"
      :disabled="loading"
      @click="emitLoadMore()"
    >
      {{ loading ? '加载中...' : '加载更多' }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import { computed, ref, watch } from 'vue'
import type { EventLogQuery, EventLogRecord } from '@garlic-claw/shared'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  events: EventLogRecord[]
  loading: boolean
  query: EventLogQuery
  nextCursor: string | null
  refreshButtonTestId?: string
  limitSelectTestId?: string
  levelFilterTestId?: string
  typeFilterTestId?: string
  searchFilterTestId?: string
  loadMoreButtonTestId?: string
}>(), {
  title: '事件日志',
  description: '查看最近的失败、治理动作与健康检查记录。',
  refreshButtonTestId: 'event-refresh',
  limitSelectTestId: 'event-limit',
  levelFilterTestId: 'event-level-filter',
  typeFilterTestId: 'event-type-filter',
  searchFilterTestId: 'event-search-filter',
  loadMoreButtonTestId: 'event-load-more',
})

const emit = defineEmits<{
  refresh: [query: EventLogQuery]
  loadMore: [query: EventLogQuery]
}>()

const limitOptions = [20, 50, 100, 200]
const selectedLimit = ref(props.query.limit ?? 50)
const levelFilter = ref<'all' | 'info' | 'warn' | 'error'>('all')
const typeFilter = ref('')
const searchFilter = ref('')
const hasActiveQueryFilters = computed(() =>
  Boolean(props.query.level || props.query.type || props.query.keyword),
)

watch(
  () => props.query,
  (query) => {
    selectedLimit.value = query.limit ?? 50
    levelFilter.value = query.level ?? 'all'
    typeFilter.value = query.type ?? ''
    searchFilter.value = query.keyword ?? ''
  },
  { immediate: true },
)

function emitRefresh(query = buildQuery()) {
  emit('refresh', query)
}

function emitLoadMore() {
  if (!props.nextCursor) {
    return
  }

  emit('loadMore', {
    ...buildQuery(),
    cursor: props.nextCursor,
  })
}

function handleLimitChange(event: Event) {
  const nextValue = Number((event.target as HTMLSelectElement).value)
  selectedLimit.value = nextValue
  emitRefresh(buildQuery())
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

function buildQuery(): EventLogQuery {
  return {
    limit: selectedLimit.value,
    ...(levelFilter.value !== 'all' ? { level: levelFilter.value } : {}),
    ...(typeFilter.value.trim() ? { type: typeFilter.value.trim() } : {}),
    ...(searchFilter.value.trim() ? { keyword: searchFilter.value.trim() } : {}),
  }
}
</script>

<style scoped>
.panel-section {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p,
.section-empty {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.section-actions,
.filter-grid {
  display: grid;
  gap: 10px;
}

.section-actions {
  grid-auto-flow: column;
  align-items: end;
  justify-content: end;
}

.filter-grid {
  grid-template-columns: 120px 120px 160px minmax(0, 1fr);
}

.control-field {
  display: grid;
  gap: 6px;
}

.control-field span {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.control-span {
  min-width: 0;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
}

.refresh-icon {
  width: 18px;
  height: 18px;
}

.load-more-button {
  justify-self: end;
}

.event-list {
  display: grid;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
}

.event-item {
  display: grid;
  gap: 8px;
  padding: 0.9rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.event-top time {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.event-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  background: var(--bg-input);
  color: var(--text-muted);
}

.event-level.info {
  color: var(--accent-hover);
}

.event-level.warn {
  color: #f0b24b;
}

.event-level.error {
  color: var(--danger);
}

.event-metadata {
  padding: 0.8rem;
  background: var(--bg-input);
  border-radius: 8px;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .section-header,
  .section-actions,
  .filter-grid {
    grid-template-columns: 1fr;
  }

  .section-actions {
    grid-auto-flow: row;
    justify-content: stretch;
  }
}
</style>
