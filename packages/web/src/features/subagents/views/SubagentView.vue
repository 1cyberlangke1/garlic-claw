<template>
  <div class="plugins-page subagent-page">
    <section class="subagent-hero">
      <header class="subagent-hero-header">
        <div>
          <span class="hero-kicker">Subagent Sessions</span>
          <h1>Subagent</h1>
          <p>管理子代理 runtime 的状态、上下文与关闭动作。</p>
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
          <p>每个主会话会聚合成一个工作区，支持在 `main / 命名子代理` 之间切换查看。</p>
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
          <span class="panel-kicker">Workspace Windows</span>
          <h2>会话窗口</h2>
          <p>按主会话聚合同步与后台子代理，并在 `main / 命名子代理` 之间查看上下文。</p>
        </div>
      </div>

      <div v-if="conversationWorkspaces.length === 0" class="sidebar-state">
        没有可查看的子代理会话。
      </div>
      <template v-else>
        <div class="conversation-rail" data-test="conversation-rail">
          <button
            v-for="workspace in conversationWorkspaces"
            :key="workspace.id"
            type="button"
            class="conversation-chip"
            :class="{ active: workspace.id === activeConversationId }"
            @click="selectConversation(workspace.id)"
          >
            <span>{{ workspace.label }}</span>
            <strong>{{ workspace.subagents.length }}</strong>
          </button>
        </div>

        <div class="window-strip" data-test="window-strip">
          <button
            v-for="windowItem in activeWorkspaceWindows"
            :key="windowItem.id"
            type="button"
            class="window-tab"
            :class="[
              { active: windowItem.id === activeWindowId },
              windowItem.kind === 'subagent' ? windowItem.status : '',
            ]"
            @click="selectWindow(windowItem.id)"
          >
            <span>{{ windowItem.label }}</span>
            <strong v-if="windowItem.kind === 'subagent'">{{ statusLabel(windowItem.status) }}</strong>
          </button>
        </div>

        <div class="workspace-stage">
          <template v-if="activeWindowKind === 'main'">
            <div class="workspace-summary-grid">
              <article class="workspace-summary-card">
                <span class="overview-label">主会话</span>
                <strong>{{ activeConversationLabel }}</strong>
                <p>当前窗口下共有 {{ activeConversationSubagents.length }} 个子代理会话。</p>
              </article>
              <article class="workspace-summary-card">
                <span class="overview-label">运行态</span>
                <strong>{{ activeRunningCount }}</strong>
                <p>仍处于排队或执行中的子代理数量。</p>
              </article>
              <article class="workspace-summary-card">
                <span class="overview-label">异常态</span>
                <strong>{{ activeErrorCount }}</strong>
                <p>失败状态的子代理数量。</p>
              </article>
            </div>

            <div class="workspace-agent-list">
              <button
                v-for="subagent in activeConversationSubagents"
                :key="subagent.conversationId"
                type="button"
                class="workspace-agent-card"
                :class="subagent.status"
                @click="selectWindow(subagent.conversationId)"
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
              </button>
            </div>
          </template>

          <template v-else>
            <div v-if="detailLoading" class="sidebar-state">正在读取子代理上下文...</div>
            <p v-else-if="detailError" class="page-banner error">{{ detailError }}</p>
            <template v-else-if="activeSubagentDetail && activeSubagentSummary">
              <div class="detail-grid">
                <article class="detail-card">
                  <span class="overview-label">窗口</span>
                  <strong>{{ activeWindow?.label }}</strong>
                  <p>{{ activeSubagentSummary.description || activeSubagentSummary.requestPreview }}</p>
                </article>
                <article class="detail-card">
                  <span class="overview-label">发起方 / 模型</span>
                  <strong>{{ activeSubagentSummary.pluginDisplayName || activeSubagentSummary.pluginId }}</strong>
                  <p>{{ activeSubagentSummary.providerId || '未指定 provider' }} / {{ activeSubagentSummary.modelId || '未指定 model' }}</p>
                </article>
                <article class="detail-card">
                  <span class="overview-label">运行方式</span>
                  <strong>会话级 runtime</strong>
                  <p>子代理直接作为真实会话存在，并支持继续输入、等待、中断与关闭。</p>
                </article>
              </div>

              <article v-if="activeSubagentDetail.request.system" class="detail-section">
                <header class="detail-section-header">
                  <h3>系统提示词</h3>
                </header>
                <pre class="detail-pre">{{ activeSubagentDetail.request.system }}</pre>
              </article>

              <article class="detail-section" data-test="subagent-context-panel">
                <header class="detail-section-header">
                  <h3>上下文消息</h3>
                  <span>{{ activeSubagentDetail.request.messages.length }} 条</span>
                </header>
                <div class="message-stack">
                  <section
                    v-for="(message, index) in activeSubagentDetail.request.messages"
                    :key="`${message.role}-${index}`"
                    class="message-card"
                  >
                    <div class="message-card-header">
                      <strong>{{ message.role }}</strong>
                      <span>#{{ index + 1 }}</span>
                    </div>
                    <pre class="detail-pre">{{ formatMessageContent(message.content) }}</pre>
                  </section>
                </div>
              </article>

              <article class="detail-section">
                <header class="detail-section-header">
                  <h3>执行结果</h3>
                </header>
                <p v-if="activeSubagentDetail.error" class="warning-text">
                  {{ activeSubagentDetail.error }}
                </p>
                <pre v-else-if="activeSubagentDetail.result" class="detail-pre">{{ activeSubagentDetail.result.text }}</pre>
                <p v-else class="muted-text">还没有结果输出。</p>
              </article>
            </template>
          </template>
        </div>
      </template>
    </section>

    <section class="subagent-list-panel">
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Subagent Overview</span>
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
                @click="openSubagentWindow(subagent)"
              >
                查看上下文
              </ElButton>
              <ElButton
                class="ghost-button danger-button"
                data-test="remove-subagent-button"
                :disabled="closingConversationId === subagent.conversationId"
                @click="closeSubagentConversation(subagent.conversationId)"
              >
                {{ closingConversationId === subagent.conversationId ? '关闭中...' : '关闭' }}
              </ElButton>
              <RouterLink
                class="ghost-button link-button"
                to="/tools"
              >
                打开工具管理
              </RouterLink>
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
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import { ElButton, ElInput } from 'element-plus'
import type { ChatMessagePart, PluginSubagentSummary } from '@garlic-claw/shared'
import SegmentedSwitch from '@/components/SegmentedSwitch.vue'
import { useSubagents } from '../composables/use-subagents'

const {
  loading,
  error,
  detailLoading,
  detailError,
  conversationWorkspaces,
  activeConversationId,
  activeConversationSubagents,
  activeWindowId,
  activeWindow,
  activeWindowKind,
  activeWorkspaceWindows,
  activeSubagentDetail,
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
  selectWindow,
  subagentCount,
} = useSubagents()

const activeConversationLabel = computed(() =>
  conversationWorkspaces.value.find((workspace) => workspace.id === activeConversationId.value)?.label ?? '暂无主会话',
)
const activeSubagentSummary = computed(() =>
  activeWindow.value?.kind === 'subagent' ? activeWindow.value.summary : null,
)
const activeRunningCount = computed(() =>
  activeConversationSubagents.value.filter((subagent) => subagent.status === 'queued' || subagent.status === 'running').length,
)
const activeErrorCount = computed(() =>
  activeConversationSubagents.value.filter((subagent) => subagent.status === 'error').length,
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

function openSubagentWindow(subagent: PluginSubagentSummary) {
  const conversationId = subagent.parentConversationId?.trim() || '__global__'
  selectConversation(conversationId)
  selectWindow(subagent.conversationId)
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

function formatMessageContent(content: string | ChatMessagePart[]) {
  if (typeof content === 'string') {
    return content
  }
  return content.map((part) => formatMessagePart(part)).join('\n\n')
}

function formatMessagePart(part: ChatMessagePart) {
  switch (part.type) {
    case 'text':
      return part.text
    case 'image':
      return `[image] ${part.image}`
    default:
      return '[unknown-part]'
  }
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
.workspace-agent-header,
.message-card-header {
  display: flex;
  gap: 0.75rem;
}

.subagent-hero-header,
.panel-header,
.subagent-card-top,
.workspace-agent-header,
.message-card-header {
  justify-content: space-between;
}

.subagent-hero-side,
.hero-note,
.subagent-list,
.workspace-stage,
.workspace-agent-list,
.message-stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hero-kicker,
.panel-kicker,
.hero-note-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-grid,
.workspace-summary-grid,
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.overview-card,
.workspace-summary-card,
.detail-card,
.workspace-agent-card,
.detail-section,
.message-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  background: transparent;
}

.overview-card,
.workspace-summary-card,
.detail-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.overview-card.warning {
  border-color: rgba(214, 162, 36, 0.4);
}

.conversation-rail,
.window-strip {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.conversation-chip,
.window-tab {
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

.conversation-chip.active,
.window-tab.active {
  border-color: var(--accent);
  color: var(--accent);
}

.window-tab.running,
.window-tab.queued {
  border-color: rgba(214, 162, 36, 0.4);
}

.window-tab.error {
  border-color: rgba(184, 74, 74, 0.4);
}

.window-tab.completed {
  border-color: rgba(44, 125, 88, 0.4);
}

.workspace-agent-card {
  text-align: left;
  cursor: pointer;
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

.panel-controls input {
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

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.detail-section-header h3 {
  margin: 0;
  font-size: 0.95rem;
}

.detail-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
}

.message-card-header {
  align-items: center;
  color: var(--text-muted);
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

.link-button {
  align-self: flex-start;
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
