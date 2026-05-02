<template>
  <section class="panel-section">
    <div :class="headerClass">
      <div v-if="showHeader">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <ElButton
        v-if="showSaveButton"
        class="save-button"
        :title="saveButtonTitle"
        :disabled="saving || !hasSchema"
        @click="submit"
      >
        <Icon :icon="disketteBold" class="save-icon" aria-hidden="true" />
      </ElButton>
    </div>

    <p v-if="formError" class="section-error">{{ formError }}</p>
    <p v-else-if="sourceError" class="section-error">{{ sourceError }}</p>
    <p v-if="!hasSchema" class="section-empty">{{ emptyText }}</p>

    <div v-else-if="rootSchema" class="config-layout">
      <SchemaConfigNodeRenderer
        is-root
        node-key="root"
        :node-schema="rootSchema"
        :model-value="draft"
        :root-values="draft"
        :special-options="specialOptions"
        @update:model-value="applyDraft"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElButton } from 'element-plus'
import type {
  AiProviderSummary,
  JsonObject,
  JsonValue,
  PluginConfigNodeSchema,
  PluginConfigSchema,
  PluginConfigSnapshot,
  PluginPersonaSummary,
  PluginSubagentTypeSummary,
} from '@garlic-claw/shared'
import { listAiProviders } from '@/modules/ai-settings/api/ai'
import { subscribeInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'
import SchemaConfigNodeRenderer from '@/modules/config/components/SchemaConfigNodeRenderer.vue'
import { listPersonas } from '@/modules/personas/api/personas'
import { listSubagentTypes } from '@/modules/plugins/api/plugins'

const props = withDefaults(defineProps<{
  snapshot: PluginConfigSnapshot | null
  saving: boolean
  showHeader?: boolean
  title?: string
  description?: string
  emptyText?: string
  saveButtonTitle?: string
  autoSave?: boolean
  autoSaveDelayMs?: number
  showSaveButton?: boolean
}>(), {
  autoSave: false,
  autoSaveDelayMs: 500,
  showHeader: true,
  showSaveButton: true,
  title: '配置',
  description: '按声明的配置元数据统一渲染。',
  emptyText: '无可编辑的配置。',
  saveButtonTitle: '保存配置',
})

const emit = defineEmits<{
  (event: 'save', values: PluginConfigSnapshot['values']): void
  (event: 'draft-change', values: PluginConfigSnapshot['values']): void
}>()

const draft = ref<JsonObject>({})
const formError = ref<string | null>(null)
const sourceError = ref<string | null>(null)
const specialOptions = reactive<{
  personas: PluginPersonaSummary[]
  providers: AiProviderSummary[]
  subagentTypes: PluginSubagentTypeSummary[]
}>({
  personas: [],
  providers: [],
  subagentTypes: [],
})

const rootSchema = computed<PluginConfigSchema | undefined>(() => props.snapshot?.schema ?? undefined)
const hasSchema = computed(() => !!rootSchema.value)
const headerClass = computed(() =>
  props.showHeader ? 'section-header' : 'section-actions',
)
const committedDraftSignature = ref('{}')
const pendingDraftSignature = ref<string | null>(null)
const draftChangeTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const unsubscribeInternalConfigChanged = subscribeInternalConfigChanged(({ scope }) => {
  if (scope !== 'provider-models' || !rootSchema.value || !schemaNeedsProviderOptions(rootSchema.value)) {
    return
  }
  void refreshSpecialOptions(rootSchema.value)
})

watch(
  () => props.snapshot,
  (snapshot) => {
    formError.value = null
    draft.value = resolveDraftValues(snapshot)
    const snapshotSignature = JSON.stringify(draft.value)
    committedDraftSignature.value = snapshotSignature
    pendingDraftSignature.value = pendingDraftSignature.value === snapshotSignature
      ? null
      : pendingDraftSignature.value
  },
  { immediate: true },
)

watch(
  draft,
  () => {
    const resolvedDraft = readResolvedDraftValues()
    emit('draft-change', resolvedDraft)
    if (!props.autoSave || !hasSchema.value) {
      return
    }
    const nextSignature = JSON.stringify(resolvedDraft)
    if (nextSignature === committedDraftSignature.value) {
      clearDraftChangeTimer()
      return
    }
    scheduleAutoSave()
  },
  { deep: true },
)

watch(
  () => props.saving,
  (saving) => {
    if (saving || !props.autoSave || !hasSchema.value) {
      return
    }
    if (
      pendingDraftSignature.value
      && pendingDraftSignature.value !== committedDraftSignature.value
    ) {
      pendingDraftSignature.value = null
      scheduleAutoSave(0)
      return
    }
    if (readResolvedDraftSignature() !== committedDraftSignature.value) {
      scheduleAutoSave(0)
    }
  },
)

onBeforeUnmount(() => {
  clearDraftChangeTimer()
  unsubscribeInternalConfigChanged()
})

watch(
  rootSchema,
  async (nextSchema) => {
    await refreshSpecialOptions(nextSchema)
  },
  { immediate: true },
)

async function refreshSpecialOptions(nextSchema: PluginConfigSchema | undefined) {
  sourceError.value = null
  if (!nextSchema) {
    specialOptions.providers = []
    specialOptions.personas = []
    specialOptions.subagentTypes = []
    return
  }

  try {
    const [providers, personas, subagentTypes] = await Promise.all([
      schemaNeedsProviderOptions(nextSchema) ? listAiProviders() : Promise.resolve([]),
      schemaNeedsPersonaOptions(nextSchema) ? listPersonas() : Promise.resolve([]),
      schemaNeedsSubagentTypeOptions(nextSchema) ? listSubagentTypes() : Promise.resolve([]),
    ])
    specialOptions.providers = providers
    specialOptions.personas = personas
    specialOptions.subagentTypes = subagentTypes
  } catch (error) {
    specialOptions.providers = []
    specialOptions.personas = []
    specialOptions.subagentTypes = []
    sourceError.value = error instanceof Error ? error.message : '加载配置选择器数据失败'
  }
}

function applyDraft(nextValue: JsonValue | undefined) {
  draft.value = isJsonObject(nextValue) ? copyJsonObject(nextValue) : {}
}

function submit() {
  try {
    const values = readResolvedDraftValues()
    pendingDraftSignature.value = JSON.stringify(values)
    emit('save', values)
    formError.value = null
  } catch (error) {
    pendingDraftSignature.value = null
    formError.value = error instanceof Error ? error.message : '配置格式无效'
  }
}

function scheduleAutoSave(delayMs = props.autoSaveDelayMs) {
  clearDraftChangeTimer()
  draftChangeTimer.value = setTimeout(() => {
    draftChangeTimer.value = null
    if (props.saving || !props.autoSave || !hasSchema.value) {
      return
    }
    const nextSignature = readResolvedDraftSignature()
    if (
      nextSignature === committedDraftSignature.value
      || nextSignature === pendingDraftSignature.value
    ) {
      return
    }
    submit()
  }, delayMs)
}

function clearDraftChangeTimer() {
  if (!draftChangeTimer.value) {
    return
  }
  clearTimeout(draftChangeTimer.value)
  draftChangeTimer.value = null
}

function resolveDraftValues(snapshot: PluginConfigSnapshot | null): JsonObject {
  if (!snapshot?.schema) {
    return copyJsonObject(snapshot?.values)
  }
  return copyJsonObject(resolveConfigObjectValue(snapshot.schema, snapshot.values))
}

function readResolvedDraftSignature() {
  return JSON.stringify(readResolvedDraftValues())
}

function copyJsonObject(value: JsonObject | undefined): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function resolveConfigObjectValue(
  schema: PluginConfigSchema,
  currentValue: JsonObject | undefined,
): JsonObject {
  return (resolveConfigNodeValue(schema, currentValue) ?? {}) as JsonObject
}

function readResolvedDraftValues(): JsonObject {
  return rootSchema.value ? copyJsonObject(resolveConfigObjectValue(rootSchema.value, draft.value)) : {}
}

function resolveConfigNodeValue(
  schema: PluginConfigNodeSchema,
  currentValue: JsonValue | undefined,
): JsonValue | undefined {
  if (schema.type === 'object') {
    const source = isJsonObject(currentValue) ? currentValue : {}
    const result: JsonObject = {}

    for (const [key, childSchema] of Object.entries(schema.items)) {
      const childValue = resolveConfigNodeValue(childSchema, source[key])
      if (typeof childValue !== 'undefined') {
        result[key] = childValue
      }
    }

    return result
  }

  if (schema.type === 'list') {
    const sourceList = Array.isArray(currentValue)
      ? currentValue
      : Array.isArray(schema.defaultValue)
        ? schema.defaultValue
        : null
    if (!sourceList) {
      return typeof schema.defaultValue !== 'undefined'
        ? schema.defaultValue
        : undefined
    }
    const itemSchema = schema.items
    if (!itemSchema) {
      return sourceList
    }
    return sourceList.map((item) => resolveConfigNodeValue(itemSchema, item) ?? null)
  }

  if (typeof currentValue !== 'undefined') {
    return currentValue
  }

  return typeof schema.defaultValue !== 'undefined'
    ? schema.defaultValue
    : undefined
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function schemaNeedsProviderOptions(configSchema: PluginConfigSchema): boolean {
  return schemaUsesSpecialType(configSchema, ['selectProvider', 'selectProviders'])
}

function schemaNeedsPersonaOptions(configSchema: PluginConfigSchema): boolean {
  return schemaUsesSpecialType(configSchema, ['selectPersona', 'personaPool'])
}

function schemaNeedsSubagentTypeOptions(configSchema: PluginConfigSchema): boolean {
  return schemaUsesSpecialType(configSchema, ['selectSubagentType'])
}

function schemaUsesSpecialType(
  node: PluginConfigNodeSchema,
  targetTypes: string[],
): boolean {
  if (node.specialType && targetTypes.includes(node.specialType)) {
    return true
  }
  if (node.type === 'object') {
    return Object.values(node.items).some((child) => schemaUsesSpecialType(child, targetTypes))
  }
  if (node.type === 'list' && node.items) {
    return schemaUsesSpecialType(node.items, targetTypes)
  }
  return false
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

.section-actions {
  display: flex;
  justify-content: flex-end;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  flex-shrink: 0;
  color: var(--text);
}

.save-icon {
  width: 18px;
  height: 18px;
  color: var(--text);
}

.section-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.section-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.config-layout {
  display: grid;
  gap: 14px;
}
</style>
