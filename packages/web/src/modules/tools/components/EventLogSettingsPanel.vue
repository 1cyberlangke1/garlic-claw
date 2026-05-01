<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>

    <label class="control-field">
      <span>最大日志文件大小</span>
      <div class="input-row">
        <ElInputNumber
          v-model.number="draftMaxFileSizeMb"
          :min="0"
          :step="0.1"
          controls-position="right"
        />
        <span class="unit-chip">MB</span>
      </div>
    </label>

    <div class="action-row">
      <small>默认 1MB。设置为 0 表示关闭新的日志写入。</small>
      <ElButton
        type="primary"
        :disabled="saving || isUnchanged"
        @click="emitSave()"
      >
        {{ saving ? '保存中...' : '保存日志设置' }}
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElInputNumber } from 'element-plus'
import type { EventLogSettings } from '@garlic-claw/shared'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  settings: EventLogSettings | null
  saving: boolean
}>(), {
  title: '日志设置',
  description: '控制当前实体自己的事件日志文件大小。',
})

const emit = defineEmits<{
  save: [settings: EventLogSettings]
}>()

const draftMaxFileSizeMb = ref(1)

const isUnchanged = computed(() =>
  draftMaxFileSizeMb.value === (props.settings?.maxFileSizeMb ?? 1),
)

watch(
  () => props.settings,
  (settings) => {
    draftMaxFileSizeMb.value = settings?.maxFileSizeMb ?? 1
  },
  { immediate: true },
)

function emitSave() {
  emit('save', {
    maxFileSizeMb: Math.max(0, Number(draftMaxFileSizeMb.value) || 0),
  })
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
  display: grid;
  gap: 6px;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p,
.control-field small {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.control-field {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.control-field > span {
  font-size: 0.82rem;
  white-space: nowrap;
}

.input-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.input-row :deep(.el-input-number) {
  width: 96px;
}

.input-row :deep(.el-input-number) input {
  width: 100%;
}

.unit-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.82rem;
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.action-row small {
  color: var(--text-muted);
  font-size: 0.82rem;
}

@media (max-width: 720px) {
  .input-row {
    align-items: stretch;
    flex-direction: column;
  }

  .input-row :deep(.el-input-number) {
    width: 100%;
  }
}
</style>
