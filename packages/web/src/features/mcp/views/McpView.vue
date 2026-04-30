<template>
  <div class="mcp-page">
    <section class="mcp-hero">
      <header>
        <span class="hero-kicker">MCP Workspace</span>
        <h1>MCP 管理</h1>
        <p>这里维护 MCP server 配置；工具启用/禁用统一在工具管理页处理。</p>
      </header>
    </section>

    <section class="mcp-management-entry">
      <div>
        <h2>工具管理入口</h2>
        <p>工具启用/禁用统一在工具管理页，这里只保留 MCP server 配置和日志能力。</p>
      </div>
      <a class="ghost-link" href="/tools?kind=mcp">打开工具管理</a>
    </section>

    <McpConfigPanel />
  </div>
</template>

<script setup lang="ts">
import McpConfigPanel from '@/features/tools/components/McpConfigPanel.vue'
</script>

<style scoped>
.mcp-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
}

.mcp-hero {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-panel-soft);
}

.mcp-management-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-panel-soft);
}

.hero-kicker,
.mcp-hero p,
.mcp-management-entry p {
  color: var(--text-muted);
}

.mcp-hero h1,
.mcp-hero p,
.mcp-management-entry h2,
.mcp-management-entry p {
  margin: 0;
}

.ghost-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  text-decoration: none;
}

@media (max-width: 720px) {
  .mcp-page {
    padding: 1rem;
  }

  .mcp-management-entry {
    grid-template-columns: 1fr;
  }
}
</style>
