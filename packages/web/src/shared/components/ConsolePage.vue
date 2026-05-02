<script setup lang="ts">
defineProps<{
  noPadding?: boolean
}>()
</script>

<template>
  <div class="console-page">
    <slot name="header" />
    <div class="console-page-shell" :class="{ 'no-padding': noPadding }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.console-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 1.5rem 2rem;
}

.console-page-shell {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--shell-border);
  border-radius: 16px;
  background: var(--shell-bg-elevated);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.25rem 1.5rem;
}

.console-page-shell.no-padding {
  padding: 0;
  overflow: hidden;
}

@media (max-width: 720px) {
  .console-page {
    padding: 1rem;
  }
}
</style>
