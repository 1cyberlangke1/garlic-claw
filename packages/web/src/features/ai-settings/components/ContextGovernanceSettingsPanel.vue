<template>
  <section class="panel-shell">
    <header class="panel-header">
      <div>
        <span class="panel-kicker">Context</span>
        <h2>上下文治理</h2>
        <p>这里直接配置自动标题、上下文压缩/滑动窗口，以及压缩摘要专用模型。</p>
      </div>
    </header>

    <section class="model-card">
      <div class="model-card-header">
        <div>
          <h3>压缩模型</h3>
          <p>为空时默认使用当前会话所选模型；设置后，摘要压缩会固定走这里选择的 provider/model。</p>
        </div>
        <button
          type="button"
          class="clear-button"
          :disabled="!compressionModel"
          @click="clearCompressionModel"
        >
          清除
        </button>
      </div>

      <ModelQuickInput
        :provider="compressionModel?.providerId ?? null"
        :model="compressionModel?.modelId ?? null"
        :disabled="!snapshot"
        placeholder="留空表示继承当前会话模型"
        @change="setCompressionModel"
      />

      <p v-if="compressionModel" class="model-summary">
        当前压缩模型：{{ compressionModel.providerId }}/{{ compressionModel.modelId }}
      </p>
      <p v-else class="model-summary model-summary-muted">
        当前压缩模型：继承当前会话模型
      </p>
    </section>

    <SchemaConfigForm
      :snapshot="snapshot"
      :saving="saving"
      :show-header="false"
      @save="saveConfig"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { JsonObject, PluginConfigSnapshot } from '@garlic-claw/shared'
import ModelQuickInput from '@/components/ModelQuickInput.vue'
import SchemaConfigForm from '@/features/config/components/SchemaConfigForm.vue'

const props = defineProps<{
  snapshot: PluginConfigSnapshot | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', values: PluginConfigSnapshot['values']): void
}>()

const compressionModel = ref<{ modelId: string; providerId: string } | null>(null)

watch(
  () => props.snapshot,
  (snapshot) => {
    compressionModel.value = readCompressionModel(snapshot?.values)
  },
  { immediate: true },
)

function saveConfig(values: PluginConfigSnapshot['values']) {
  emit('save', mergeCompressionModel(values, compressionModel.value))
}

function clearCompressionModel() {
  compressionModel.value = null
}

function setCompressionModel(value: { modelId: string; providerId: string }) {
  compressionModel.value = value
}

function readCompressionModel(values: PluginConfigSnapshot['values'] | undefined) {
  const contextCompaction = readJsonObject(values?.contextCompaction)
  const routeTarget = readJsonObject(contextCompaction?.compressionModel)
  if (!routeTarget) {
    return null
  }
  const providerId = typeof routeTarget.providerId === 'string' ? routeTarget.providerId.trim() : ''
  const modelId = typeof routeTarget.modelId === 'string' ? routeTarget.modelId.trim() : ''
  return providerId && modelId ? { providerId, modelId } : null
}

function mergeCompressionModel(
  values: PluginConfigSnapshot['values'],
  routeTarget: { modelId: string; providerId: string } | null,
): JsonObject {
  const nextValues = cloneJsonObject(values)
  const contextCompaction = readJsonObject(nextValues.contextCompaction) ?? {}
  if (routeTarget) {
    contextCompaction.compressionModel = {
      modelId: routeTarget.modelId,
      providerId: routeTarget.providerId,
    }
  } else {
    delete contextCompaction.compressionModel
  }
  if (Object.keys(contextCompaction).length > 0) {
    nextValues.contextCompaction = contextCompaction
  } else {
    delete nextValues.contextCompaction
  }
  return nextValues
}

function cloneJsonObject(value: PluginConfigSnapshot['values']): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function readJsonObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : null
}
</script>

<style scoped>
.panel-shell,
.panel-header,
.model-card {
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

.model-card {
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.model-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.model-card-header h3,
.model-card-header p,
.model-summary {
  margin: 0;
}

.model-card-header p,
.model-summary-muted {
  color: var(--text-muted);
}

.clear-button {
  width: fit-content;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
}
</style>
