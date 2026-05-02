<template>
  <section class="panel-section mcp-config-panel">
    <p v-if="panelError" class="page-banner error">{{ panelError }}</p>

    <div class="mcp-workspace">
      <aside class="mcp-server-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-header-copy">
            <h2>MCP Server</h2>
            <p>统一维护命令、参数、环境变量与事件日志配置。</p>
          </div>
        </div>

        <div v-if="!loading && servers.length > 0" class="sidebar-overview">
          <div class="sidebar-stat">
            <span>总数</span>
            <strong>{{ filteredServers.length }}</strong>
          </div>
          <div class="sidebar-stat">
            <span>带变量</span>
            <strong>{{ withEnvCount }}</strong>
          </div>
          <div class="sidebar-stat spotlight">
            <span>当前</span>
            <strong>{{ currentSelectionLabel }}</strong>
          </div>
        </div>

        <div v-if="!loading && servers.length > 0" class="sidebar-tools">
          <ElInput
            v-model="searchKeyword"
            data-test="mcp-sidebar-search"
            placeholder="搜索名称、命令或参数"
          />
          <p v-if="isCreating" class="sidebar-inline-hint">
            当前正在新建 Server，保存后会自动刷新并选中。
          </p>
        </div>

        <p v-if="selectedServerHidden" class="sidebar-hint">
          当前选中的 Server 未命中筛选条件。
        </p>

        <div v-if="loading" class="sidebar-state">
          加载中...
        </div>
        <div v-else-if="servers.length === 0" class="sidebar-state">
          还没有 MCP server 配置。
        </div>
        <div v-else-if="filteredServers.length === 0" class="sidebar-state">
          当前筛选下没有匹配的 MCP server。
        </div>
        <div v-else class="mcp-server-list">
          <ElButton
            v-for="server in filteredServers"
            :key="server.name"
            class="mcp-server-item"
            :class="{ active: !isCreating && selectedServerName === server.name }"
            @click="selectExisting(server.name)"
          >
            <div class="mcp-server-item-top">
              <strong>{{ server.name }}</strong>
              <span class="mcp-server-badge">{{ server.command }}</span>
            </div>
            <p class="mcp-server-command">
              {{ renderCommandPreview(server) }}
            </p>
            <div class="mcp-server-meta">
              <span>{{ server.args.length }} 个参数</span>
              <span>{{ Object.keys(server.env).length }} 个环境变量</span>
            </div>
          </ElButton>
        </div>
      </aside>

      <div class="mcp-detail">
        <header class="mcp-detail-header">
          <div class="mcp-detail-copy">
            <h2>{{ view === 'manage' ? 'MCP 配置' : 'MCP 日志' }}</h2>
            <p>
              {{ view === 'manage'
                ? '维护当前 Server 的启动命令、参数和环境变量。'
                : '查看当前 Server 的事件记录，并按需调整日志落盘策略。' }}
            </p>
          </div>
        </header>

        <form v-if="view === 'manage'" class="mcp-editor" @submit.prevent="submitForm">
          <label class="mcp-field">
            <span>名称</span>
            <ElInput
              v-model="draftName"
              data-test="mcp-name-input"
              placeholder="weather-server"
            />
          </label>
          <label class="mcp-field">
            <span>命令</span>
            <ElInput
              v-model="draftCommand"
              data-test="mcp-command-input"
              placeholder="npx"
            />
          </label>
          <label class="mcp-field">
            <span>参数</span>
            <ElInput
              v-model="draftArgsText"
              data-test="mcp-args-input"
              type="textarea"
              :rows="6"
              placeholder="-y&#10;tavily-mcp@latest"
            />
            <small>每行一个参数，保存时会自动去掉空行。</small>
          </label>

          <section class="mcp-env-panel mcp-field-span">
            <div class="mcp-env-header">
              <div>
                <span>环境变量</span>
                <p>支持直接值或 `${VAR_NAME}` 占位符。</p>
              </div>
              <ElButton class="action-icon-button" title="新增变量" @click="addEnvRow">
                <Icon :icon="addCircleBold" class="action-icon" aria-hidden="true" />
              </ElButton>
            </div>

            <div v-if="envRows.length === 0" class="sidebar-state">
              没有环境变量。
            </div>
            <div v-else class="mcp-env-list">
              <div
                v-for="(entry, index) in envRows"
                :key="entry.id"
                class="mcp-env-row"
              >
                <div class="mcp-env-inputs">
                  <ElInput
                    :data-test="`mcp-env-key-${index}`"
                    v-model="entry.key"
                    placeholder="TAVILY_API_KEY"
                  />
                  <ElInput
                    :data-test="`mcp-env-value-${index}`"
                    v-model="entry.value"
                    placeholder="${TAVILY_API_KEY}"
                  />
                  <ElButton
                    class="action-icon-button danger-icon-button"
                    title="删除"
                    :disabled="envRows.length === 1"
                    @click="removeEnvRow(index)"
                  >
                    <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
                  </ElButton>
                </div>
              </div>
            </div>
          </section>

          <div class="mcp-editor-actions">
            <ElButton
              type="primary"
              class="hero-action"
              data-test="mcp-save-button"
              :title="saving ? '保存中...' : isCreating ? '创建 Server' : '保存修改'"
              :disabled="saving"
            >
              <Icon :icon="disketteBold" class="action-icon" aria-hidden="true" />
            </ElButton>
            <ElButton
              v-if="!isCreating && selectedServer"
              type="danger"
              class="danger-icon-button"
              data-test="mcp-delete-button"
              :title="deleting ? '删除中...' : '删除 Server'"
              :disabled="deleting"
              @click="removeSelectedServer"
            >
              <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
            </ElButton>
          </div>
        </form>

        <div v-else-if="selectedServer" class="mcp-log-panel">
          <EventLogSettingsPanel
            v-if="showLogSettings"
            :settings="selectedServer.eventLog"
            :saving="savingEventLog"
            title="MCP 日志设置"
            description="此 MCP server 的事件日志会写入 log/mcp/<serverName>/ 目录。"
            @save="saveServerEventLog"
          />
          <EventLogPanel
            title="MCP 事件日志"
            description="查看此 server 最近的事件记录。"
            :events="eventLogs"
            :loading="eventLoading"
            :query="eventQuery"
            :next-cursor="eventNextCursor"
            @refresh="refreshServerEvents"
            @load-more="loadMoreServerEvents"
          />
        </div>

        <div v-else class="sidebar-state mcp-log-empty">
          请先在配置视图中创建或选择一个 MCP server。
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import trashBinMinimalisticBold from '@iconify-icons/solar/trash-bin-minimalistic-bold'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import type { McpServerConfig } from '@garlic-claw/shared'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import { useMcpConfigManagement } from '@/modules/tools/composables/use-mcp-config-management'

const props = withDefaults(defineProps<{
  preferredServerName?: string | null
  view?: 'manage' | 'logs'
}>(), {
  view: 'manage',
})

const emit = defineEmits<{
  changed: []
}>()

interface EnvRow {
  id: number
  key: string
  value: string
}

const {
  loading,
  saving,
  savingEventLog,
  deleting,
  servers,
  selectedServerName,
  selectedServer,
  eventLoading,
  eventLogs,
  eventQuery,
  eventNextCursor,
  refresh,
  selectServer,
  createServer,
  updateServer,
  deleteServer,
  saveServerEventLog,
  refreshServerEvents,
  loadMoreServerEvents,
} = useMcpConfigManagement()

const draftName = ref('')
const draftCommand = ref('')
const draftArgsText = ref('')
const envRows = ref<EnvRow[]>([])
const panelError = ref<string | null>(null)
const isCreating = ref(false)
const showLogSettings = ref(false)
const searchKeyword = ref('')
let envRowId = 0

const normalizedKeyword = computed(() =>
  searchKeyword.value.trim().toLocaleLowerCase(),
)
const filteredServers = computed(() =>
  servers.value.filter((server) => matchesServer(server, normalizedKeyword.value)),
)
const withEnvCount = computed(() =>
  servers.value.filter((server) => Object.keys(server.env).length > 0).length,
)
const currentSelectionLabel = computed(() => {
  if (isCreating.value) {
    return '新建中'
  }

  return selectedServer.value?.name ?? '未选择'
})
const selectedServerHidden = computed(() =>
  !isCreating.value
  && !!selectedServerName.value
  && !filteredServers.value.some((server) => server.name === selectedServerName.value),
)

watch(
  [() => props.preferredServerName, servers],
  ([nextName]) => {
    if (!nextName) {
      return
    }

    if (servers.value.some((server) => server.name === nextName)) {
      isCreating.value = false
      selectServer(nextName)
    }
  },
  { immediate: true },
)

watch(
  selectedServer,
  (server) => {
    if (isCreating.value) {
      return
    }

    if (!server) {
      resetDraft()
      return
    }

    applyServerToDraft(server)
  },
  { immediate: true },
)

function startCreate() {
  isCreating.value = true
  panelError.value = null
  showLogSettings.value = false
  resetDraft()
  selectServer(null)
}

function selectExisting(name: string) {
  isCreating.value = false
  panelError.value = null
  showLogSettings.value = false
  selectServer(name)
}

function addEnvRow() {
  envRows.value.push(createEnvRow())
}

function removeEnvRow(index: number) {
  if (envRows.value.length === 1) {
    envRows.value[0] = createEnvRow()
    return
  }

  envRows.value.splice(index, 1)
}

async function submitForm() {
  panelError.value = null
  try {
    const payload = buildPayload()
    if (isCreating.value || !selectedServer.value) {
      await createServer(payload)
      isCreating.value = false
      emit('changed')
      return
    }

    await updateServer(selectedServer.value.name, payload)
    emit('changed')
  } catch (caughtError) {
    panelError.value = caughtError instanceof Error
      ? caughtError.message
      : '保存 MCP server 失败'
  }
}

async function removeSelectedServer() {
  if (!selectedServer.value) {
    return
  }

  panelError.value = null
  try {
    await deleteServer(selectedServer.value.name)
    if (servers.value.length === 0) {
      startCreate()
    }
    emit('changed')
  } catch (caughtError) {
    panelError.value = caughtError instanceof Error
      ? caughtError.message
      : '删除 MCP server 失败'
  }
}

function buildPayload(): McpServerConfig {
  const name = draftName.value.trim()
  const command = draftCommand.value.trim()
  if (!name) {
    throw new Error('名称不能为空')
  }
  if (!command) {
    throw new Error('命令不能为空')
  }

  return {
    name,
    command,
    args: draftArgsText.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    env: Object.fromEntries(
      envRows.value
        .map((entry) => [entry.key.trim(), entry.value.trim()] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0),
    ),
    eventLog: selectedServer.value?.eventLog ?? {
      maxFileSizeMb: 1,
    },
  }
}

function matchesServer(server: McpServerConfig, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  const haystack = [
    server.name,
    server.command,
    server.args.join(' '),
    ...Object.keys(server.env),
    ...Object.values(server.env),
  ]
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(keyword)
}

function renderCommandPreview(server: McpServerConfig): string {
  const args = server.args.join(' ')
  return args ? `${server.command} ${args}` : server.command
}

function applyServerToDraft(server: McpServerConfig) {
  draftName.value = server.name
  draftCommand.value = server.command
  draftArgsText.value = server.args.join('\n')
  envRows.value = Object.entries(server.env).map(([key, value]) => createEnvRow(key, value))
  if (envRows.value.length === 0) {
    envRows.value = [createEnvRow()]
  }
}

function resetDraft() {
  draftName.value = ''
  draftCommand.value = ''
  draftArgsText.value = ''
  envRows.value = [createEnvRow()]
}

function createEnvRow(key = '', value = ''): EnvRow {
  envRowId += 1
  return {
    id: envRowId,
    key,
    value,
  }
}

function handleRefresh() {
  if (props.view === 'logs') {
    void refreshServerEvents(undefined, selectedServerName.value)
    return
  }
  void refresh(selectedServerName.value)
}

function toggleLogSettings() {
  showLogSettings.value = !showLogSettings.value
}

defineExpose({
  loading,
  selectedServer,
  showLogSettings,
  startCreate,
  handleRefresh,
  toggleLogSettings,
})
</script>

<style scoped>
.mcp-config-panel {
  display: grid;
  gap: 14px;
  padding: 0.35rem;
  background: transparent;
  border: none;
}

.mcp-workspace {
  display: flex;
  gap: 16px;
  min-height: 0;
}

.mcp-server-sidebar {
  width: min(320px, 100%);
  flex-shrink: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  min-height: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--surface-card-gradient);
}

.sidebar-header,
.sidebar-header-copy,
.mcp-detail-copy {
  display: grid;
  gap: 4px;
}

.sidebar-header h2,
.mcp-detail-copy h2 {
  margin: 0;
  font-size: 1.14rem;
  font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.sidebar-header p,
.mcp-detail-copy p,
.sidebar-inline-hint,
.sidebar-hint,
.sidebar-state {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.sidebar-hint {
  color: #f5d38c;
}

.sidebar-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.sidebar-stat {
  display: grid;
  gap: 4px;
  padding: 0.8rem 0.85rem;
  border-radius: 14px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-hover-soft);
}

.sidebar-stat span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sidebar-stat strong {
  font-size: 1rem;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.sidebar-stat.spotlight strong {
  color: var(--accent);
}

.sidebar-tools,
.mcp-server-list,
.mcp-editor,
.mcp-log-panel,
.mcp-env-panel,
.mcp-env-list,
.mcp-detail {
  display: grid;
  gap: 14px;
}

.mcp-server-list {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.mcp-detail {
  flex: 1;
  min-width: 0;
  align-content: start;
}

.mcp-detail-header {
  padding: 0 0.35rem;
}

.mcp-editor,
.mcp-log-panel,
.mcp-log-empty {
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 22px;
  background: var(--surface-card-gradient);
}

.mcp-server-item {
  position: relative;
  display: grid;
  gap: 8px;
  height: auto;
  padding: 0.75rem 0.85rem;
  border: 1px solid rgba(133, 163, 199, 0.12);
  border-radius: 12px;
  background: var(--surface-card-gradient);
  color: var(--text);
  text-align: left;
  white-space: normal;
  justify-items: stretch;
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.mcp-server-item::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, rgba(103, 199, 207, 0.08), transparent 46%, rgba(240, 198, 118, 0.06));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.mcp-server-item:hover:not(.active) {
  transform: translateY(-1px);
  border-color: rgba(103, 199, 207, 0.22);
}

.mcp-server-item.active {
  border-color: rgba(103, 199, 207, 0.34);
  background: var(--surface-hero-gradient);
  box-shadow:
    0 16px 32px rgba(1, 6, 15, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.mcp-server-item.active::after,
.mcp-server-item:hover::after {
  opacity: 1;
}

.mcp-server-item-top,
.mcp-server-meta,
.mcp-env-header,
.mcp-env-row,
.mcp-editor-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.mcp-server-item-top strong,
.mcp-server-badge,
.mcp-server-command,
.mcp-server-meta span {
  color: var(--text);
}

.mcp-server-item-top strong {
  font-size: 0.92rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.mcp-server-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(133, 163, 199, 0.16);
  background: var(--surface-panel-soft);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.mcp-server-command {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.mcp-server-meta {
  justify-content: flex-start;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.mcp-field,
.mcp-field-span {
  display: grid;
  gap: 8px;
}

.mcp-field-span {
  grid-column: 1 / -1;
}

.mcp-field :deep(.el-textarea__inner) {
  width: 100%;
  border: 1px solid var(--el-input-border-color, #dcdfe6);
  border-radius: var(--el-input-border-radius, 4px);
  background: var(--el-input-bg-color, #fff);
  padding: 8px 12px;
  box-shadow: none;
  color: var(--el-input-text-color, #333);
}

.mcp-field :deep(.el-textarea__inner:focus) {
  border-color: var(--el-input-focus-border-color, #409eff);
}

.mcp-field small,
.mcp-env-header p {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.mcp-env-panel {
  padding: 1rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 18px;
  background: var(--surface-panel-muted);
}

.mcp-env-row {
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
}

.mcp-env-inputs {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 8px 10px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.7rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 12px;
  background: var(--surface-panel-hover-soft);
  align-items: center;
}

.mcp-env-inputs :deep(.el-input) {
  grid-column: 1;
}

.mcp-env-inputs button {
  grid-column: 2;
  grid-row: 1 / 3;
}

.action-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  flex-shrink: 0;
}

.action-icon-button.active {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
}

.hero-action .action-icon {
  width: 20px;
  height: 20px;
}

.action-icon-button .action-icon {
  width: 18px;
  height: 18px;
}

.danger-icon-button {
  color: #ffd1d1;
}

.danger {
  color: #ffd1d1;
}

.mcp-config-panel .action-icon {
  width: 18px;
  height: 18px;
}

.mcp-log-empty {
  min-height: 240px;
  place-items: center;
  border-style: dashed;
  background: var(--surface-panel-muted);
}

@media (max-width: 1080px) {
  .mcp-workspace {
    flex-direction: column;
  }

  .mcp-server-sidebar {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .sidebar-overview {
    grid-template-columns: 1fr;
  }

  .mcp-server-list {
    grid-auto-flow: column;
    grid-auto-columns: minmax(248px, 82vw);
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
  }

  .mcp-editor-actions > * {
    flex: 1 1 120px;
  }
}
</style>
