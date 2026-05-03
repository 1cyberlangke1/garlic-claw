<template>
  <div class="plugins-page subagent-page">
    <section class="subagent-hero">
      <header class="subagent-hero-header">
        <div>
          <h1>Subagent</h1>
          <p>管理子代理 runtime 的状态、跳转入口与关闭动作。</p>
        </div>
        <div class="subagent-hero-side">
          <ElButton
            class="hero-action icon-only"
            title="刷新全部"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-action-icon" aria-hidden="true" />
          </ElButton>
          <div class="hero-note">
            <span class="hero-note-label">子代理面板</span>
            <strong>{{ heroHeadline }}</strong>
            <p>每个主会话会聚合成一个工作区，具体上下文统一回到聊天页顶部切换栏查看。</p>
          </div>
        </div>
      </header>

      <div class="overview-grid">
        <article
          v-for="card in overviewCards"
          :key="card.label"
          class="overview-card"
          :class="card.tone"
        >
          <span class="overview-label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.note }}</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <section class="subagent-workspace-panel">
      <div class="panel-header">
        <div>
          <h2>会话窗口</h2>
          <p>按主会话聚合同步与后台子代理，这里只保留索引与跳转，不再重复渲染详情正文。</p>
        </div>
      </div>

      <div v-if="conversationWorkspaces.length === 0" class="sidebar-state">
        没有可查看的子代理会话。
      </div>
      <template v-else>
        <div class="conversation-rail" data-test="conversation-rail">
          <ElButton
            v-for="workspace in conversationWorkspaces"
            :key="workspace.id"
            class="conversation-chip"
            :class="{ active: workspace.id === activeConversationId }"
            @click="selectConversation(workspace.id)"
          >
            <span>{{ workspace.label }}</span>
            <strong>{{ workspace.subagents.length }}</strong>
          </ElButton>
        </div>

        <div class="workspace-stage">
          <div class="workspace-summary-grid">
            <article class="workspace-summary-card">
              <span class="overview-label">主会话</span>
              <strong>{{ activeConversationLabel }}</strong>
              <p>当前工作区下共有 {{ activeConversationSubagents.length }} 个子代理会话。</p>
            </article>
            <article class="workspace-summary-card">
              <span class="overview-label">运行态</span>
              <strong>{{ activeRunningCount }}</strong>
              <p>仍处于排队或执行中的子代理数量。</p>
            </article>
            <article class="workspace-summary-card">
              <span class="overview-label">查看方式</span>
              <strong>主对话复用</strong>
              <p>子代理上下文已经统一回到主对话页，这里只保留索引与跳转。</p>
            </article>
          </div>

          <div class="workspace-agent-list">
            <article
              v-for="subagent in activeConversationSubagents"
              :key="subagent.conversationId"
              class="workspace-agent-card"
              :class="subagent.status"
            >
              <div class="workspace-agent-header">
                <strong>{{ readSubagentDisplayLabel(subagent) }}</strong>
                <span class="status-pill" :class="subagent.status">{{ statusLabel(subagent.status) }}</span>
              </div>
              <p>{{ subagent.description || subagent.requestPreview }}</p>
              <div class="meta-row">
                <span class="meta-chip">消息 {{ subagent.messageCount }} 条</span>
                <span v-if="subagent.providerId" class="meta-chip">{{ subagent.providerId }}</span>
                <span v-if="subagent.modelId" class="meta-chip">{{ subagent.modelId }}</span>
              </div>
              <div class="workspace-agent-actions">
                <ElButton class="ghost-button" @click="openSubagentConversation(subagent)">
                  在对话中查看
                </ElButton>
              </div>
            </article>
          </div>
        </div>
      </template>
    </section>

    <section class="subagent-list-panel">
      <div class="panel-header">
        <div>
          <h2>子代理账本</h2>
          <p>按发起方、模型和状态查看子代理 runtime，不再依赖独立账本文件。</p>
        </div>
        <ElButton
          class="ghost-button icon-only"
          title="刷新"
          @click="refreshAll()"
        >
          <Icon :icon="refreshBold" class="ghost-button-icon" aria-hidden="true" />
        </ElButton>
      </div>

      <div class="panel-controls">
        <ElInput
          v-model="searchKeyword"
          data-test="subagent-search"
          placeholder="搜索发起方、请求摘要、结果摘要或模型"
        />
        <SegmentedSwitch v-model="filter" :options="filterOptions" />
      </div>

      <div class="sidebar-results">
        <span class="sidebar-results-text">
          匹配 {{ filteredSubagentCount }} / {{ subagentCount }} 个子代理
          <span v-if="subagentCount > 0">
            · 第 {{ page }} / {{ pageCount }} 页
            · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
          </span>
        </span>
      </div>

      <div v-if="loading" class="sidebar-state">加载中...</div>
      <div v-else-if="pagedSubagents.length === 0" class="sidebar-state">
        此筛选下没有子代理。
      </div>
      <div v-else class="subagent-list">
        <article
          v-for="subagent in pagedSubagents"
          :key="subagent.conversationId"
          class="subagent-card"
        >
          <div class="subagent-card-top">
            <div>
              <div class="subagent-title-row">
                <strong>{{ readSubagentDisplayLabel(subagent) }}</strong>
                <span class="status-pill" :class="subagent.status">{{ statusLabel(subagent.status) }}</span>
              </div>
              <p class="detail-line muted-text">
                发起方: {{ subagent.pluginDisplayName || subagent.pluginId }}
              </p>
              <p>{{ subagent.description || subagent.requestPreview }}</p>
            </div>
            <div class="subagent-card-actions">
              <ElButton
                class="ghost-button"
                @click="openSubagentConversation(subagent)"
              >
                在对话中查看
              </ElButton>
              <ElButton
                class="ghost-button danger-button"
                data-test="remove-subagent-button"
                :disabled="closingConversationId === subagent.conversationId"
                @click="closeSubagentConversation(subagent.conversationId)"
              >
                {{ closingConversationId === subagent.conversationId ? '关闭中...' : '关闭' }}
              </ElButton>
            </div>
          </div>

          <div class="meta-row">
            <span class="meta-chip">{{ subagent.runtimeKind === 'local' ? '本地' : '远程' }}</span>
            <span v-if="subagent.subagentTypeName || subagent.subagentType" class="meta-chip">
              {{ subagent.subagentTypeName || subagent.subagentType }}
            </span>
            <span class="meta-chip">消息 {{ subagent.messageCount }} 条</span>
            <span v-if="subagent.providerId" class="meta-chip">{{ subagent.providerId }}</span>
            <span v-if="subagent.modelId" class="meta-chip">{{ subagent.modelId }}</span>
          </div>

          <p v-if="subagent.resultPreview" class="detail-line">
            结果摘要: {{ subagent.resultPreview }}
          </p>
          <p v-if="subagent.error" class="detail-line warning-text">
            失败原因: {{ subagent.error }}
          </p>
          <p class="detail-line muted-text">
            请求时间: {{ formatTime(subagent.requestedAt) }}
            <span> · 会话更新于 {{ formatTime(subagent.updatedAt) }}</span>
            <span v-if="subagent.finishedAt"> · 完成于 {{ formatTime(subagent.finishedAt) }}</span>
            <span v-if="subagent.closedAt"> · 关闭于 {{ formatTime(subagent.closedAt) }}</span>
          </p>
        </article>
      </div>

      <div v-if="subagentCount > 0" class="sidebar-pagination">
        <ElButton
          class="ghost-button"
          :disabled="!canGoPrevPage"
          @click="goPrevPage"
        >
          上一页
        </ElButton>
        <ElButton
          class="ghost-button"
          :disabled="!canGoNextPage"
          @click="goNextPage"
        >
          下一页
        </ElButton>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import { ElButton, ElInput } from 'element-plus'
import type { PluginSubagentSummary } from '@garlic-claw/shared'
import { useChatStore } from '@/modules/chat/store/chat'
import SegmentedSwitch from '@/shared/components/SegmentedSwitch.vue'
import { useSubagents } from '../composables/use-subagents'

const chat = useChatStore()
const router = useRouter()

const {
  loading,
  error,
  conversationWorkspaces,
  activeConversationId,
  activeConversationSubagents,
  closingConversationId,
  searchKeyword,
  filter,
  pagedSubagents,
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  canGoPrevPage,
  canGoNextPage,
  goPrevPage,
  goNextPage,
  filteredSubagentCount,
  runningSubagentCount,
  errorSubagentCount,
  refreshAll,
  closeSubagentConversation,
  selectConversation,
  subagentCount,
} = useSubagents()

const activeConversationLabel = computed(() =>
  conversationWorkspaces.value.find((workspace) => workspace.id === activeConversationId.value)?.label ?? '暂无主会话',
)
const activeRunningCount = computed(() =>
  activeConversationSubagents.value.filter((subagent) => subagent.status === 'queued' || subagent.status === 'running').length,
)

const heroHeadline = computed(() => {
  if (subagentCount.value === 0) {
    return '等待首个后台子代理排队'
  }
  if (runningSubagentCount.value > 0) {
    return `${runningSubagentCount.value} 个子代理仍在执行中`
  }
  if (errorSubagentCount.value > 0) {
    return `${errorSubagentCount.value} 个子代理需要人工关注`
  }

  return `${subagentCount.value} 个子代理都已落地可追踪`
})

const overviewCards = computed(() => [
  {
    label: '子代理总数',
    value: String(subagentCount.value),
    note: '同步与后台子代理都会被持久化记录，刷新页面也不会丢',
    tone: 'accent',
  },
  {
    label: '运行中',
    value: String(runningSubagentCount.value),
    note: runningSubagentCount.value > 0 ? '仍有子代理在排队或运行' : '没有活跃子代理',
    tone: runningSubagentCount.value > 0 ? 'warning' : 'neutral',
  },
  {
    label: '失败子代理',
    value: String(errorSubagentCount.value),
    note: errorSubagentCount.value > 0 ? '失败子代理需要回看请求和插件权限' : '没有失败子代理',
    tone: errorSubagentCount.value > 0 ? 'warning' : 'neutral',
  },
])

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'completed', label: '已完成' },
  { value: 'error', label: '失败' },
]

async function openSubagentConversation(subagent: PluginSubagentSummary) {
  const conversationId = subagent.parentConversationId?.trim() || subagent.conversationId
  await chat.selectConversation(conversationId)
  await router.push({ name: 'chat' })
}

function statusLabel(status: 'closed' | 'completed' | 'error' | 'interrupted' | 'queued' | 'running') {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '运行中'
    case 'completed':
      return '已完成'
    case 'interrupted':
      return '已中断'
    case 'closed':
      return '已关闭'
    default:
      return '失败'
  }
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`
}

function readSubagentDisplayLabel(subagent: PluginSubagentSummary) {
  return subagent.title.trim() || subagent.description || subagent.pluginDisplayName || subagent.pluginId
}
</script>

<style scoped>
.subagent-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 0;
}

.subagent-hero,
.subagent-workspace-panel,
.subagent-list-panel {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.subagent-hero-header,
.panel-header,
.subagent-card-top,
.panel-controls,
.meta-row,
.workspace-agent-header {
  display: flex;
  gap: 0.75rem;
}

.subagent-hero-header,
.panel-header,
.subagent-card-top,
.workspace-agent-header {
  justify-content: space-between;
}

.subagent-hero-side,
.hero-note,
.subagent-list,
.workspace-stage,
.workspace-agent-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hero-note-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-grid,
.workspace-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.overview-card,
.workspace-summary-card,
.workspace-agent-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  background: transparent;
}

.overview-card,
.workspace-summary-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.overview-card.warning {
  border-color: rgba(214, 162, 36, 0.4);
}

.conversation-rail {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.conversation-chip {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
}

.conversation-chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.workspace-agent-card {
  text-align: left;
}

.workspace-agent-card.running,
.workspace-agent-card.queued {
  border-color: rgba(214, 162, 36, 0.4);
}

.workspace-agent-card.error {
  border-color: rgba(184, 74, 74, 0.4);
}

.workspace-agent-card.completed {
  border-color: rgba(44, 125, 88, 0.4);
}

.panel-controls {
  flex-wrap: wrap;
  align-items: center;
  margin: 1rem 0 0.75rem;
}

.panel-controls :deep(.el-input),
.panel-controls :deep(.el-select) {
  flex: 1 1 240px;
}

.meta-row,
.subagent-title-row,
.subagent-card-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.meta-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
}

.subagent-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem;
}

.status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.status-pill.running,
.status-pill.queued {
  border-color: rgba(214, 162, 36, 0.4);
  color: #b77c15;
}

.status-pill.completed {
  border-color: rgba(44, 125, 88, 0.4);
  color: #2c7d58;
}

.status-pill.error {
  border-color: rgba(184, 74, 74, 0.4);
  color: #b84a4a;
}

.danger-button {
  border-color: rgba(184, 74, 74, 0.24);
  color: #b84a4a;
}

.detail-line,
.sidebar-state {
  color: var(--text-muted);
}

.warning-text {
  color: #b84a4a;
}

.muted-text {
  font-size: 0.85rem;
}

.hero-action.icon-only,
.ghost-button.icon-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.hero-action-icon,
.ghost-button-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 980px) {
  .subagent-hero-header,
  .panel-header,
  .subagent-card-top {
    flex-direction: column;
  }
}
</style>
