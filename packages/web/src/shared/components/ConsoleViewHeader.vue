<script setup lang="ts">
import { computed } from 'vue'
import type { IconifyIcon } from '@iconify/types'
import { Icon } from '@iconify/vue'
import HeaderViewSwitch from '@/shared/components/HeaderViewSwitch.vue'

interface ConsoleViewOption {
  label: string
  value: string
  disabled?: boolean
  title?: string
}

const props = withDefaults(defineProps<{
  title: string
  icon?: string | IconifyIcon | null
  modelValue?: string
  viewOptions?: readonly ConsoleViewOption[]
  ariaLabel?: string
}>(), {
  icon: null,
  modelValue: undefined,
  viewOptions: () => [],
  ariaLabel: '页面视图切换',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const hasSwitch = computed(() =>
  typeof props.modelValue === 'string' && props.viewOptions.length > 0,
)

function handleViewUpdate(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <section class="console-view-header">
    <header class="console-view-header__row">
      <h1 class="console-view-header__title">
        <Icon v-if="icon" :icon="icon" class="console-view-header__icon" aria-hidden="true" />
        {{ title }}
      </h1>

      <div v-if="hasSwitch || $slots.actions" class="console-view-header__controls">
        <HeaderViewSwitch
          v-if="hasSwitch"
          :model-value="modelValue!"
          :options="viewOptions"
          :aria-label="ariaLabel"
          @update:model-value="handleViewUpdate"
        />
        <slot name="actions" />
      </div>
    </header>

    <slot />
  </section>
</template>

<style scoped>
.console-view-header {
  display: grid;
  gap: 0.9rem;
}

.console-view-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.console-view-header__title {
  margin: 0;
  min-width: 0;
}

.console-view-header__icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.console-view-header__controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

:deep(.view-header-action.el-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
}

:deep(.view-header-action .view-header-action-icon) {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .console-view-header__row,
  .console-view-header__controls {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
