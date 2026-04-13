<template>
  <div class="segmented-switch" role="group" aria-label="分段切换">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segmented-option"
      :class="{ active: modelValue === option.value }"
      :aria-pressed="modelValue === option.value"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
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
</script>

<style scoped>
.segmented-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: rgba(9, 17, 29, 0.38);
}

.segmented-option {
  padding: 0.35rem 0.85rem;
  border-radius: 8px;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.15s ease, color 0.15s ease;
}

.segmented-option:hover:not(:disabled) {
  color: var(--text);
}

.segmented-option.active {
  background: rgba(103, 199, 207, 0.14);
  color: #d8f6f3;
  border-color: rgba(103, 199, 207, 0.22);
}
</style>
