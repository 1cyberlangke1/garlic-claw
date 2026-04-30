<template>
  <div class="mcp-page">
    <section class="mcp-hero">
      <header>
        <h1><Icon :icon="widgetAddBold" class="hero-icon" aria-hidden="true" />MCP 管理</h1>
      </header>
    </section>

    <McpConfigPanel />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import McpConfigPanel from '@/features/tools/components/McpConfigPanel.vue'
</script>

<style scoped>
.mcp-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
}

.mcp-hero {
  /* clean header row — no box */
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.hero-kicker,
.mcp-hero p {
  color: var(--text-muted);
}

.mcp-hero h1,
.mcp-hero p {
  margin: 0;
}

@media (max-width: 720px) {
  .mcp-page {
    padding: 1rem;
  }
}
</style>
