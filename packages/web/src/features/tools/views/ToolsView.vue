<template>
  <div class="tools-page">
    <section class="tools-hero">
      <div class="hero-copy">
        <span class="hero-kicker">统一入口</span>
        <h1>工具管理</h1>
        <p>
          执行工具、子代理、MCP 和插件工具的启用/禁用统一收口到这里。
          连接配置、运行参数和插件详情仍在各自页面维护。
        </p>
      </div>

      <div class="hero-actions">
        <a class="ghost-link" href="/ai">AI 设置</a>
        <a class="ghost-link" href="/mcp">MCP 配置</a>
        <a class="ghost-link" href="/plugins">插件详情</a>
      </div>
    </section>

    <section class="tools-grid">
      <ToolGovernancePanel
        source-kind="internal"
        source-id="runtime-tools"
        title="执行工具管理"
        description="内部执行工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。"
        :show-source-list="false"
        empty-title="暂无内部执行工具"
        empty-description="当前运行时还没有注册内部执行工具。"
      />

      <ToolGovernancePanel
        source-kind="internal"
        source-id="subagent"
        title="子代理工具管理"
        description="内部子代理工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。"
        :show-source-list="false"
        empty-title="暂无内部子代理工具"
        empty-description="当前运行时还没有注册内部子代理工具。"
      />

      <ToolGovernancePanel
        source-kind="mcp"
        :source-id="preferredMcpSourceId"
        title="MCP 工具管理"
        description="统一管理所有 MCP server 暴露的工具。server 配置仍在 MCP 页面维护。"
        :show-source-list="!preferredMcpSourceId"
        empty-title="暂无 MCP 工具源"
        empty-description="先在 MCP 页面添加 server，保存后这里会出现对应工具源。"
      />

      <ToolGovernancePanel
        source-kind="plugin"
        :source-id="preferredPluginSourceId"
        title="插件工具管理"
        description="统一管理插件暴露给宿主的工具。插件配置、作用域和日志仍在插件详情页维护。"
        :show-source-list="!preferredPluginSourceId"
        empty-title="暂无插件工具源"
        empty-description="插件接入并注册工具后，会在这里统一出现。"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'

const route = useRoute()

const focusedSourceKind = computed(() =>
  typeof route.query.kind === 'string' ? route.query.kind : null,
)
const focusedSourceId = computed(() => {
  if (typeof route.query.source !== 'string') {
    return null
  }

  const sourceId = route.query.source.trim()
  return sourceId.length > 0 ? sourceId : null
})
const preferredMcpSourceId = computed(() =>
  focusedSourceKind.value === 'mcp' ? focusedSourceId.value : null,
)
const preferredPluginSourceId = computed(() =>
  focusedSourceKind.value === 'plugin' ? focusedSourceId.value : null,
)
</script>

<style scoped>
.tools-page,
.tools-grid {
  display: grid;
  gap: 18px;
}

.tools-page {
  min-height: 100%;
  padding: 1.5rem 2rem;
}

.tools-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: rgba(11, 21, 35, 0.72);
}

.hero-copy {
  display: grid;
  gap: 10px;
}

.hero-copy h1,
.hero-copy p {
  margin: 0;
}

.hero-kicker {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-copy p {
  color: var(--text-muted);
  max-width: 60rem;
}

.hero-actions {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
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

@media (max-width: 900px) {
  .tools-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .tools-page {
    padding: 1rem;
  }
}
</style>
