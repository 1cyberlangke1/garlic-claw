<template>
  <div class="tools-page">
    <section class="tools-hero">
      <div class="hero-copy">
        <h1><Icon :icon="tuning2Bold" class="hero-icon" aria-hidden="true" />工具管理</h1>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <section v-if="visibleSections.length > 0" class="tools-grid">
      <ToolGovernancePanel
        v-if="hasRuntimeTools"
        source-kind="internal"
        source-id="runtime-tools"
        title="执行工具管理"
        description="内部执行工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。"
        :show-source-list="false"
        empty-title="暂无内部执行工具"
        empty-description="当前运行时还没有注册内部执行工具。"
      />

      <ToolGovernancePanel
        v-if="hasSubagentTools"
        source-kind="internal"
        source-id="subagent"
        title="子代理工具管理"
        description="内部子代理工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。"
        :show-source-list="false"
        empty-title="暂无内部子代理工具"
        empty-description="当前运行时还没有注册内部子代理工具。"
      />

      <ToolGovernancePanel
        v-if="hasMcpTools"
        source-kind="mcp"
        :source-id="preferredMcpSourceId"
        title="MCP 工具管理"
        description="统一管理所有 MCP server 暴露的工具。server 配置仍在 MCP 页面维护。"
        :show-source-list="!preferredMcpSourceId"
        empty-title="暂无 MCP 工具源"
        empty-description="先在 MCP 页面添加 server，保存后这里会出现对应工具源。"
      />

      <ToolGovernancePanel
        v-if="hasPluginTools"
        source-kind="plugin"
        :source-id="preferredPluginSourceId"
        title="插件工具管理"
        description="统一管理插件暴露给宿主的工具。插件配置、作用域和日志仍在插件详情页维护。"
        :show-source-list="!preferredPluginSourceId"
        empty-title="暂无插件工具源"
        empty-description="插件接入并注册工具后，会在这里统一出现。"
      />
    </section>

    <section v-else-if="!loading" class="empty-state">
      <h2>当前还没有可管理的实际工具</h2>
      <p>只有已经接入并实际注册了工具的执行源，才会出现在这个页面。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ToolSourceInfo } from '@garlic-claw/shared'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import tuning2Bold from '@iconify-icons/solar/tuning-2-bold'
import { subscribeInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'
import { subscribePluginConfigChanged } from '@/modules/plugins/plugin-config-change'
import ToolGovernancePanel from '@/modules/tools/components/ToolGovernancePanel.vue'
import { loadToolOverview, toErrorMessage } from '@/modules/tools/composables/tool-management.data'

const route = useRoute()
const loading = ref(false)
const error = ref<string | null>(null)
const sources = ref<ToolSourceInfo[]>([])
let refreshRequestId = 0

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
const visibleSources = computed(() =>
  sources.value.filter((source) => source.totalTools > 0),
)
const hasRuntimeTools = computed(() =>
  hasSource('internal', 'runtime-tools'),
)
const hasSubagentTools = computed(() =>
  hasSource('internal', 'subagent'),
)
const hasMcpTools = computed(() =>
  hasSource('mcp', preferredMcpSourceId.value),
)
const hasPluginTools = computed(() =>
  hasSource('plugin', preferredPluginSourceId.value),
)
const visibleSections = computed(() => [
  hasRuntimeTools.value,
  hasSubagentTools.value,
  hasMcpTools.value,
  hasPluginTools.value,
].filter(Boolean))
let removeInternalConfigChangedListener = () => {}
let removePluginConfigChangedListener = () => {}

onMounted(() => {
  removeInternalConfigChangedListener = subscribeInternalConfigChanged(({ scope }) => {
    if (scope !== 'runtime-tools' && scope !== 'subagent' && scope !== 'mcp') {
      return
    }
    void refresh()
  })
  removePluginConfigChangedListener = subscribePluginConfigChanged(() => {
    void refresh()
  })
  void refresh()
})

onUnmounted(() => {
  removeInternalConfigChangedListener()
  removePluginConfigChangedListener()
})

async function refresh() {
  const requestId = ++refreshRequestId
  loading.value = true
  error.value = null
  try {
    const overview = await loadToolOverview()
    if (requestId !== refreshRequestId) {
      return
    }
    sources.value = overview.sources
  } catch (caughtError) {
    if (requestId !== refreshRequestId) {
      return
    }
    error.value = toErrorMessage(caughtError, '加载工具管理总览失败')
  } finally {
    if (requestId === refreshRequestId) {
      loading.value = false
    }
  }
}

function hasSource(kind: ToolSourceInfo['kind'], sourceId?: string | null) {
  if (sourceId) {
    return visibleSources.value.some((source) => source.kind === kind && source.id === sourceId)
  }

  return visibleSources.value.some((source) => source.kind === kind)
}
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

.page-banner,
.empty-state {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-panel-soft);
}

.page-banner.error,
.empty-state p {
  color: var(--text-muted);
}

.empty-state {
  display: grid;
  gap: 8px;
}

.empty-state h2,
.empty-state p {
  margin: 0;
}

.tools-hero {
  display: grid;
  gap: 10px;
}

.hero-copy {
  display: grid;
  gap: 10px;
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.hero-copy h1 {
  margin: 0;
}

@media (max-width: 720px) {
  .tools-page {
    padding: 1rem;
  }
}
</style>
