<template>
  <ElRadioGroup
    class="segmented-switch"
    :model-value="modelValue"
    size="small"
    @update:model-value="handleUpdate"
  >
    <ElRadioButton
      v-for="option in options"
      :key="option.value"
      class="segmented-option"
      :value="option.value"
    >
      {{ option.label }}
    </ElRadioButton>
  </ElRadioGroup>
</template>

<script setup lang="ts">
import { ElRadioButton, ElRadioGroup } from 'element-plus'

interface Option {
  value: string
  label: string
}

defineProps<{
  modelValue: string
  options: Option[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

function handleUpdate(value: string | number | boolean | undefined) {
  if (typeof value === 'string') {
    emit('update:modelValue', value)
  }
}
</script>

<style scoped>
.segmented-switch {
  --el-radio-button-checked-bg-color: color-mix(in srgb, var(--accent) 14%, transparent);
  --el-radio-button-checked-border-color: color-mix(in srgb, var(--accent) 28%, transparent);
  --el-radio-button-checked-text-color: var(--accent);
  --el-radio-button-bg-color: transparent;
  --el-radio-button-text-color: var(--text-muted);
  --el-radio-button-border-color: rgba(133, 163, 199, 0.14);
  --el-fill-color-blank: transparent;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-hover-soft);
}

.segmented-switch :deep(.el-radio-button__inner) {
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
}

.segmented-switch :deep(.el-radio-button:first-child .el-radio-button__inner),
.segmented-switch :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 8px;
}

.segmented-switch :deep(.el-radio-button.is-active .el-radio-button__inner) {
  box-shadow: none;
}
</style>
