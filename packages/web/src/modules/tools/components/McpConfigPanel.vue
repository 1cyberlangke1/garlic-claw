<template>
  <section class="panel-section mcp-config-panel">
    <div class="mcp-config-header">
      <div>
        <h3>{{ view === 'manage' ? 'MCP 配置' : 'MCP 事件日志' }}</h3>
        <p v-if="view === 'manage'">管理 <code>{{ snapshot.configPath || 'mcp/servers/' }}</code> 目录中的 server 定义，保存后会自动重载运行时。</p>
        <p v-else>按 server 查看最近事件记录，避免和配置编辑区同时堆叠展示。</p>
      </div>
      <div class="mcp-config-actions">
        <ElButton
          class="action-icon-button"
          :title="view === 'manage' ? '刷新配置' : '刷新日志'"
          :disabled="loading"
          @click="handleRefresh"
        >
          <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
        </ElButton>
        <ElButton
          v-if="view === 'logs' && selectedServer"
          class="action-icon-button"
          :class="{ active: showLogSettings }"
          title="日志设置"
          @click="showLogSettings = !showLogSettings"
        >
          <Icon :icon="settingsBold" class="action-icon" aria-hidden="true" />
        </ElButton>
        <ElButton
          v-if="view === 'manage'"
          class="action-icon-button"
          data-test="mcp-new-button"
          title="新增 Server"
          @click="startCreate"
        >
          <Icon :icon="addCircleBold" class="action-icon" aria-hidden="true" />
        </ElButton>
      </div>
    </div>
    <p v-if="panelError" class="page-banner error">{{ panelError }}</p>

    <div :class="view === 'manage' ? 'mcp-config-layout' : 'mcp-log-layout'">
      <aside class="mcp-server-sidebar">
        <div v-if="servers.length === 0" class="sidebar-state">
          还没有 MCP server 配置。
        </div>
        <ElButton
          v-for="server in servers"
          :key="server.name"
          class="mcp-server-item"
          :class="{ active: !isCreating && selectedServerName === server.name }"
          @click="selectExisting(server.name)"
        >
          <strong>{{ server.name }}</strong>
        </ElButton>
      </aside>

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
        请先在管理视图中创建或选择一个 MCP server。
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import trashBinMinimalisticBold from '@iconify-icons/solar/trash-bin-minimalistic-bold'
import { Icon } from '@iconify/vue'
import { ref, watch } from 'vue'
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
  snapshot,
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
let envRowId = 0

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
</script>

<style scoped>
.mcp-config-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-panel-soft);
}

.mcp-config-layout,
.mcp-log-layout,
.mcp-editor,
.mcp-log-panel,
.mcp-env-panel,
.mcp-env-list {
  display: grid;
  gap: 14px;
}

.mcp-config-header,
.mcp-config-actions,
.mcp-env-header,
.mcp-env-row,
.mcp-editor-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.mcp-config-layout {
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
  align-items: start;
}

.mcp-log-layout {
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
  align-items: start;
}

.mcp-server-sidebar,
.mcp-server-item {
  display: grid;
  gap: 10px;
}

.mcp-server-meta {
  display: grid;
  gap: 4px;
}

.mcp-log-empty {
  min-height: 240px;
  place-items: center;
  border: 1px dashed rgba(133, 163, 199, 0.18);
  border-radius: 18px;
  background: var(--surface-panel-muted);
}

.mcp-server-item {
  height: auto;
  min-height: 0;
  padding: 0.9rem 0.95rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 12px;
  background: var(--surface-panel-muted-strong);
  color: var(--text);
  text-align: left;
  white-space: normal;
  justify-items: start;
}

.mcp-server-item strong,
.mcp-server-item span {
  color: var(--text);
}

.mcp-server-item small {
  color: var(--text-muted);
}

.mcp-server-item {
  justify-content: flex-start;
}

.mcp-server-item :deep(.el-button__text) {
  text-align: left;
}

.mcp-server-item.active {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
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

.mcp-editor {
  grid-template-columns: minmax(0, 1fr);
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

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: auto;
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
}

.refresh-button .refresh-icon {
  width: 18px;
  height: 18px;
}

.refresh-label {
  font-size: 0.9rem;
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

.mcp-config-panel .action-icon,
.mcp-config-panel .refresh-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 1080px) {
  .mcp-config-layout,
  .mcp-log-layout,
  .mcp-editor {
    grid-template-columns: 1fr;
  }
}
</style>
