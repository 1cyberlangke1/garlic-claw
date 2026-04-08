<template>
  <button
    type="button"
    class="toggle-button"
    :class="{ secondary: variant === 'secondary' }"
    :disabled="disabled"
    @click="$emit('click')"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  disabled?: boolean
  variant?: 'primary' | 'secondary'
}>(), {
  disabled: false,
  variant: 'primary',
})

defineEmits<{
  (event: 'click'): void
}>()
</script>
