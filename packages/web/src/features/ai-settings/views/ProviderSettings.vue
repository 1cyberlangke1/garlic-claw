<template>
  <div class="ai-settings-page">
    <header class="page-header">
      <h1><Icon class="hero-icon" :icon="codeBold" aria-hidden="true" />AI 设置</h1>
    </header>
    <div class="ai-settings-shell">
      <aside class="ai-settings-sidebar">
        <nav class="sider-menu">
          <ElButton
            v-for="item in navItems"
            :key="item.id"
            class="menu-item"
            :class="{ active: activeSection === item.id, 'menu-item--divided': item.divided }"
            @click="activeSection = item.id"
          >
            <Icon class="menu-icon" :icon="item.icon" aria-hidden="true" />
            <span class="menu-label">{{ item.label }}</span>
          </ElButton>
        </nav>
    </aside>

    <main class="ai-settings-content">
      <!-- ═══ 服务商 & 模型 ═══ -->
      <section v-if="activeSection === 'provider-models'" class="provider-models-section">
        <div class="provider-column">
          <div class="column-toolbar">
            <ElInput
              v-model="providerSearch"
              class="field-input"
              placeholder="搜索服务商…"
            />
            <ElButton type="primary" @click="openCreateDialog">新增</ElButton>
          </div>

          <p v-if="error" class="msg-error">{{ error }}</p>
          <p v-else-if="loadingProviders" class="msg-muted">加载中…</p>
          <p v-else-if="filteredProviders.length === 0" class="msg-muted">暂无服务商</p>

          <div v-else class="provider-list">
            <ElButton
              v-for="p in filteredProviders"
              :key="p.id"
              class="provider-row"
              :class="{ active: p.id === selectedProviderId }"
              @click="selectProvider(p.id)"
            >
              <div class="provider-row-main">
                <span class="provider-name">{{ p.name }}</span>
                <span class="provider-driver">{{ getProviderDriverLabel(p, catalog) }}</span>
              </div>
              <div class="provider-row-meta">
                <span>{{ p.modelCount }} 个模型</span>
                <span class="status-dot" :class="p.available ? 'ok' : 'warn'" />
              </div>
            </ElButton>
          </div>
        </div>

        <div class="model-column">
          <template v-if="!selectedProvider">
            <p class="msg-muted placeholder">← 选择服务商</p>
          </template>
          <template v-else>
            <div class="column-toolbar">
              <div class="toolbar-left">
                <span class="current-provider-name">{{ selectedProvider.name }}</span>
                <span class="default-badge" v-if="currentDefaultLabel">默认：{{ currentDefaultLabel }}</span>
              </div>
              <div class="toolbar-right">
                <ElButton :disabled="discoveringModels" @click="openDiscoveryDialog">
                  {{ discoveringModels ? '发现中…' : '发现模型' }}
                </ElButton>
                <ElButton :disabled="testingConnection" @click="testProviderConnection">
                  {{ testingConnection ? '测试中…' : '测试连接' }}
                </ElButton>
                <ElButton @click="openEditDialog">编辑</ElButton>
                <ElButton type="danger" @click="deleteSelectedProvider">删除</ElButton>
              </div>
            </div>

            <p v-if="connectionResult" class="msg-status" :class="connectionResult.kind">{{ connectionResult.text }}</p>

            <div class="add-model-row">
              <ElInput v-model="newModelId" class="field-input" placeholder="模型 ID" />
              <ElInput v-model="newModelName" class="field-input" placeholder="名称（可选）" />
              <ElButton type="primary" :disabled="!newModelId.trim()" @click="handleAddModel">添加</ElButton>
            </div>

            <p class="msg-muted capability-note">
              推理 / 工具 / 图片为能力标记：用于展示模型特征，并给图片候选筛选等流程提供提示。
            </p>

            <div class="column-toolbar" v-if="selectedModels.length > 0">
              <ElInput
                v-model="modelSearch"
                class="field-input"
                placeholder="搜索模型…"
              />
              <span class="toolbar-count" v-if="modelSearch">匹配 {{ filteredModels.length }} / {{ selectedModels.length }}</span>
            </div>

            <p v-if="selectedModels.length === 0" class="msg-muted">暂无模型</p>
            <p v-else-if="filteredModels.length === 0" class="msg-muted">无匹配模型</p>

            <div v-else class="model-list">
              <div
                v-for="m in filteredModels"
                :key="m.id"
                class="model-row"
              >
                <div class="model-info">
                  <div class="model-name-row">
                    <strong>{{ m.name }}</strong>
                    <code>{{ m.id }}</code>
                  </div>
                  <div class="model-cap-row">
                    <ElCheckbox
                      :model-value="m.capabilities.reasoning"
                      @change="emitCapToggle(m, 'reasoning', $event)"
                    >
                      推理
                    </ElCheckbox>
                    <ElCheckbox
                      :model-value="m.capabilities.toolCall"
                      @change="emitCapToggle(m, 'toolCall', $event)"
                    >
                      工具
                    </ElCheckbox>
                    <ElCheckbox
                      :model-value="m.capabilities.input.image"
                      @change="emitCapImageToggle(m, $event)"
                    >
                      图片
                    </ElCheckbox>
                    <span class="cap-field">
                      上下文
                      <ElInput
                        :data-test="`context-length-input-${m.id}`"
                        class="field-input field-input-sm"
                        :value="ctxDrafts[m.id] ?? m.contextLength"
                        type="number"
                        @input="handleCtxInput(m.id, String($event))"
                      />
                    </span>
                    <ElButton
                      :data-test="`context-length-save-${m.id}`"
                      size="small"
                      :disabled="!canSaveCtx(m)"
                      @click="saveCtx(m)"
                    >
                      保存
                    </ElButton>
                  </div>
                </div>
                <div class="model-actions">
                  <span v-if="isDefaultModel(m.id)" class="default-chip">默认</span>
                  <ElButton v-else size="small" @click="setDefaultModel(m.id)">设为当前默认</ElButton>
                  <ElButton size="small" type="danger" @click="deleteModel(m.id)">删除</ElButton>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <!-- ═══ 其他设置面板 ═══ -->
      <VisionFallbackPanel
        v-if="activeSection === 'vision'"
        :config="visionConfig"
        :options="visionOptions"
        :saving="savingVision"
        @save="saveVisionConfig"
      />

      <HostModelRoutingPanel
        v-if="activeSection === 'routing'"
        :config="hostModelRoutingConfig"
        :options="hostModelRoutingOptions"
        :saving="false"
        @save="saveHostModelRoutingConfig"
      />

      <section v-if="activeSection === 'runtime-tools'" class="settings-stack">
        <RuntimeToolsSettingsPanel
          :snapshot="runtimeToolsConfigSnapshot"
          :saving="savingRuntimeToolsConfig"
          @save="saveRuntimeToolsConfig"
        />

        <article class="tool-management-hint">
          <div>
            <h3>工具启用状态</h3>
            <p>执行工具的启用/禁用已统一移到工具管理页，这里只保留运行参数配置。</p>
          </div>
          <a class="btn-ghost tool-management-link" href="/tools?kind=internal&source=runtime-tools">打开工具管理</a>
        </article>
      </section>

      <section v-if="activeSection === 'subagent'" class="settings-stack">
        <SubagentSettingsPanel
          :snapshot="subagentConfigSnapshot"
          :saving="savingSubagentConfig"
          @save="saveSubagentConfig"
        />

        <article class="tool-management-hint">
          <div>
            <h3>子代理工具状态</h3>
            <p>子代理工具的启用/禁用已统一移到工具管理页，这里只保留运行参数配置。</p>
          </div>
          <a class="btn-ghost tool-management-link" href="/tools?kind=internal&source=subagent">打开工具管理</a>
        </article>
      </section>

      <ContextGovernanceSettingsPanel
        v-if="activeSection === 'context'"
        :snapshot="contextGovernanceConfigSnapshot"
        :saving="savingContextGovernanceConfig"
        @save="saveContextGovernanceConfig"
      />
    </main>
  </div>

  <AiProviderEditorDialog
    :catalog="catalog"
    :initial-config="editingProvider"
    :title="editingProvider ? '编辑服务商' : '新增服务商'"
    :visible="showProviderDialog"
    @close="showProviderDialog = false"
    @save="saveProvider"
  />

  <AiModelDiscoveryDialog
    :loading="discoveringModels"
    :models="discoveredModels"
    :title="selectedProvider ? `发现 ${selectedProvider.name} 的模型` : '发现模型'"
    :visible="showDiscoveryDialog"
    @add="importDiscoveredModels"
    @close="showDiscoveryDialog = false"
  />
</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElCheckbox, ElInput } from 'element-plus'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import type { AiModelConfig } from '@garlic-claw/shared'
import serverBold from '@iconify-icons/solar/server-bold'
import galleryBold from '@iconify-icons/solar/gallery-bold'
import linkRoundBold from '@iconify-icons/solar/link-round-bold'
import codeBold from '@iconify-icons/solar/code-bold'
import cpuBold from '@iconify-icons/solar/cpu-bold'
import documentTextBold from '@iconify-icons/solar/document-text-bold'

import AiModelDiscoveryDialog from '@/features/ai-settings/components/AiModelDiscoveryDialog.vue'
import AiProviderEditorDialog from '@/features/ai-settings/components/AiProviderEditorDialog.vue'
import ContextGovernanceSettingsPanel from '@/features/ai-settings/components/ContextGovernanceSettingsPanel.vue'
import HostModelRoutingPanel from '@/features/ai-settings/components/HostModelRoutingPanel.vue'
import RuntimeToolsSettingsPanel from '@/features/ai-settings/components/RuntimeToolsSettingsPanel.vue'
import SubagentSettingsPanel from '@/features/ai-settings/components/SubagentSettingsPanel.vue'
import VisionFallbackPanel from '@/features/ai-settings/components/VisionFallbackPanel.vue'
import { getProviderDriverLabel } from '@/features/ai-settings/components/provider-catalog'
import { useProviderSettings } from '@/features/ai-settings/composables/use-provider-settings'

const activeSection = ref('provider-models')

const navItems: Array<{ id: string; label: string; icon: IconifyIcon; divided?: boolean }> = [
  { id: 'provider-models', label: '服务商 & 模型', icon: serverBold },
  { id: 'vision', label: '视觉回退', icon: galleryBold },
  { id: 'routing', label: '模型回退链', icon: linkRoundBold },
  { id: 'runtime-tools', label: '执行工具', icon: codeBold, divided: true },
  { id: 'subagent', label: '子代理', icon: cpuBold },
  { id: 'context', label: '上下文设置', icon: documentTextBold },
]

const {
  loadingProviders,
  savingVision,
  savingRuntimeToolsConfig,
  savingSubagentConfig,
  savingContextGovernanceConfig,
  discoveringModels,
  testingConnection,
  error,
  catalog,
  defaultSelection,
  providers,
  selectedProviderId,
  selectedProvider,
  selectedModels,
  visionConfig,
  hostModelRoutingConfig,
  runtimeToolsConfigSnapshot,
  subagentConfigSnapshot,
  contextGovernanceConfigSnapshot,
  visionOptions,
  hostModelRoutingOptions,
  showProviderDialog,
  showDiscoveryDialog,
  editingProvider,
  discoveredModels,
  connectionResult,
  selectProvider,
  openCreateDialog,
  openEditDialog,
  saveProvider,
  deleteSelectedProvider,
  addModel,
  openDiscoveryDialog,
  importDiscoveredModels,
  deleteModel,
  setDefaultModel,
  updateCapabilities,
  updateContextLength,
  testProviderConnection,
  saveVisionConfig,
  saveHostModelRoutingConfig,
  saveRuntimeToolsConfig,
  saveSubagentConfig,
  saveContextGovernanceConfig,
} = useProviderSettings()

/* ── 服务商搜索 ── */
const providerSearch = ref('')
const filteredProviders = computed(() => {
  const kw = providerSearch.value.trim().toLowerCase()
  if (!kw) return providers.value
  return providers.value.filter(p =>
    `${p.name} ${p.id} ${p.driver}`.toLowerCase().includes(kw),
  )
})

/* ── 模型搜索 ── */
const modelSearch = ref('')
const filteredModels = computed(() => {
  const kw = modelSearch.value.trim().toLowerCase()
  if (!kw) return selectedModels.value
  return selectedModels.value.filter(m =>
    `${m.name} ${m.id}`.toLowerCase().includes(kw),
  )
})
watch(() => selectedProviderId.value, () => { modelSearch.value = '' })

/* ── 当前默认标签 ── */
const currentDefaultLabel = computed(() => {
  if (!defaultSelection.value.providerId || !defaultSelection.value.modelId) return ''
  return `${defaultSelection.value.providerId} / ${defaultSelection.value.modelId}`
})
function isDefaultModel(modelId: string) {
  return selectedProvider.value?.id === defaultSelection.value.providerId
    && defaultSelection.value.modelId === modelId
}

/* ── 新增模型 ── */
const newModelId = ref('')
const newModelName = ref('')
function handleAddModel() {
  addModel({ modelId: newModelId.value.trim(), name: newModelName.value.trim() || undefined })
  newModelId.value = ''
  newModelName.value = ''
}

/* ── 能力开关 ── */
function emitCapToggle(model: AiModelConfig, key: 'reasoning' | 'toolCall', checked: string | number | boolean) {
  const enabled = checked === true
  updateCapabilities({
    modelId: model.id,
    capabilities: { ...model.capabilities, [key]: enabled },
  })
}
function emitCapImageToggle(model: AiModelConfig, checked: string | number | boolean) {
  const enabled = checked === true
  updateCapabilities({
    modelId: model.id,
    capabilities: {
      ...model.capabilities,
      input: { ...model.capabilities.input, image: enabled },
    },
  })
}

/* ── 上下文长度 ── */
const ctxDrafts = ref<Record<string, string>>({})
const ctxBases = ref<Record<string, string>>({})
watch(() => selectedModels.value, (models) => {
  const nextDrafts: Record<string, string> = {}
  const nextBases: Record<string, string> = {}
  for (const m of models) {
    const base = String(m.contextLength)
    const prevBase = ctxBases.value[m.id]
    const prevDraft = ctxDrafts.value[m.id]
    nextBases[m.id] = base
    nextDrafts[m.id] = prevDraft !== undefined && prevBase === base ? prevDraft : base
  }
  ctxBases.value = nextBases
  ctxDrafts.value = nextDrafts
}, { immediate: true })
function handleCtxInput(modelId: string, value: string) {
  ctxDrafts.value = { ...ctxDrafts.value, [modelId]: value }
}
function canSaveCtx(model: AiModelConfig) {
  const draft = Number(ctxDrafts.value[model.id] ?? model.contextLength)
  return Number.isInteger(draft) && draft > 0 && draft !== model.contextLength
}
function saveCtx(model: AiModelConfig) {
  const val = Number(ctxDrafts.value[model.id] ?? model.contextLength)
  if (Number.isInteger(val) && val > 0) updateContextLength({ modelId: model.id, contextLength: val })
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════
   布局
   ═══════════════════════════════════════════════════════════════════════ */
.ai-settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem 2rem;
  gap: 18px;
  background: var(--shell-bg, #0f172a);
}

.page-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
}

.ai-settings-shell {
  display: flex;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--shell-border, #334155);
  border-radius: 16px;
  background: var(--shell-bg-elevated, #1e293b);
  overflow: hidden;
}

/* ── 侧边栏 ── */
.ai-settings-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border, #334155);
  color: var(--shell-text, #f1f5f9);
  overflow-y: auto;
}
.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}
.sider-menu { flex: 1; overflow-y: auto; padding: 12px 8px; }
.sider-menu::-webkit-scrollbar { display: none; }

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  border: none;
  border-radius: 8px;
  padding: 0 20px;
  background: transparent;
  color: var(--shell-text-secondary, #cbd5e1);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.menu-item:hover { background: var(--shell-bg-hover, #334155); color: var(--shell-text, #f1f5f9); }
.menu-item.active { color: var(--shell-active, #18a058); background: rgba(24, 160, 88, 0.1); }
.menu-item--divided { margin-top: 14px; }
.menu-item--divided::before {
  content: '';
  position: absolute;
  left: 16px; right: 16px; top: -8px;
  height: 1px;
  background: var(--shell-border, #334155);
  opacity: 0.9;
}
.menu-icon { width: 20px; min-width: 20px; font-size: 20px; flex-shrink: 0; }
.menu-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── 内容区 ── */
.ai-settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.settings-stack {
  display: grid;
  gap: 16px;
}

.tool-management-hint {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 16px 18px;
  border: 1px solid var(--shell-border, #334155);
  border-radius: 12px;
  background: var(--shell-bg-elevated, #1e293b);
}

.tool-management-hint h3,
.tool-management-hint p {
  margin: 0;
}

.tool-management-hint p {
  color: var(--shell-text-tertiary, #94a3b8);
  font-size: 13px;
}

.tool-management-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

/* ═══════════════════════════════════════════════════════════════════════
   服务商 & 模型 双栏
   ═══════════════════════════════════════════════════════════════════════ */
.provider-models-section {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 0;
  height: 100%;
  min-width: 0;
}

.provider-column {
  border-right: 1px solid var(--shell-border, #334155);
  padding-right: 16px;
  overflow-y: auto;
}
.model-column {
  padding-left: 20px;
  overflow-y: auto;
}

/* ── 工具栏 ── */
.column-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.current-provider-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
}
.toolbar-count {
  font-size: 12px;
  color: var(--shell-text-tertiary, #94a3b8);
}
.capability-note {
  margin: 0 0 12px;
}
.default-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.15);
  color: var(--shell-active, #18a058);
  font-size: 12px;
}

/* ── 按钮 ── */
.btn-primary, .btn-ghost, .btn-danger, .btn-sm {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s ease;
}
.btn-primary {
  border: none;
  background: var(--shell-active, #18a058);
  color: #fff;
}
.btn-primary:hover { background: #16914d; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost {
  border: 1px solid var(--shell-border, #334155);
  background: transparent;
  color: var(--shell-text-secondary, #cbd5e1);
}
.btn-ghost:hover { background: var(--shell-bg-hover, #334155); color: var(--shell-text, #f1f5f9); }
.btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-danger {
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: transparent;
  color: #ef4444;
}
.btn-danger:hover { background: rgba(239, 68, 68, 0.12); }
.btn-sm { padding: 2px 8px; font-size: 12px; }

/* ── 通用字段输入 ── */
.field-input {
  padding: 5px 10px;
  border: 1px solid var(--shell-border, #334155);
  border-radius: 6px;
  background: var(--shell-bg, #0f172a);
  color: var(--shell-text, #f1f5f9);
  font-size: 13px;
  min-width: 0;
}
.field-input:focus {
  outline: none;
  border-color: var(--shell-active, #18a058);
  box-shadow: 0 0 0 1px rgba(24, 160, 88, 0.2);
}
.field-input-sm { width: 72px; padding: 3px 6px; text-align: right; }

/* ── 消息文本 ── */
.msg-muted { color: var(--shell-text-tertiary, #94a3b8); font-size: 13px; margin: 8px 0; }
.msg-error { color: #ef4444; font-size: 13px; margin: 8px 0; }
.msg-status { padding: 6px 10px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.msg-status.success { background: rgba(24, 160, 88, 0.1); color: #22c55e; }
.msg-status.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.placeholder { margin-top: 24px; }

/* ── 服务商列表 ── */
.provider-list {
  display: grid;
  gap: 0;
}
.provider-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  margin: 0 -8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--shell-text-secondary, #cbd5e1);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.provider-row:hover { background: var(--shell-bg-hover, #334155); }
.provider-row.active { background: rgba(24, 160, 88, 0.08); color: var(--shell-text, #f1f5f9); }
.provider-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.provider-name { font-weight: 500; color: var(--shell-text, #f1f5f9); }
.provider-driver { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--shell-bg-hover, #334155); color: var(--shell-text-tertiary, #94a3b8); }
.provider-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--shell-text-tertiary, #94a3b8);
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-dot.ok { background: #22c55e; }
.status-dot.warn { background: #f59e0b; }

/* ── 模型列表 ── */
.add-model-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.model-list {
  display: grid;
  gap: 0;
}
.model-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid var(--shell-border, #334155);
}
.model-row:last-child { border-bottom: none; }
.model-info {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.model-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.model-name-row strong { font-size: 14px; color: var(--shell-text, #f1f5f9); }
.model-name-row code { font-size: 12px; color: var(--shell-text-tertiary, #94a3b8); }
.model-cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.cap-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--shell-text-secondary, #cbd5e1);
  cursor: pointer;
}
.cap-field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--shell-text-secondary, #cbd5e1);
}
.model-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.default-chip {
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(24, 160, 88, 0.15);
  color: var(--shell-active, #18a058);
  font-size: 11px;
  line-height: 20px;
}

/* ── 响应式 ── */
@media (max-width: 960px) {
  .ai-settings-sidebar { width: 180px; }
  .provider-models-section { grid-template-columns: 1fr; }
  .provider-column { border-right: none; border-bottom: 1px solid var(--shell-border, #334155); padding: 0 0 12px; }
  .model-column { padding: 12px 0 0; }
  .ai-settings-content { padding: 16px; }
  .tool-management-hint { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .ai-settings-page { padding: 1rem; }
  .ai-settings-shell { flex-direction: column; }
  .ai-settings-sidebar { width: 100%; max-height: 110px; flex-shrink: 0; border-right: none; border-bottom: 1px solid var(--shell-border, #334155); }
  .sider-menu { display: flex; gap: 4px; padding: 0 12px 8px; overflow-x: auto; overflow-y: hidden; }
  .menu-item { min-height: 40px; padding: 0 14px; white-space: nowrap; flex-shrink: 0; }
  .menu-item--divided { margin-top: 0; }
  .menu-item--divided::before { display: none; }
  .provider-models-section { grid-template-columns: 1fr; }
  .ai-settings-content { padding: 12px; }
}
</style>

<!-- 子组件玻璃拟态 → 干净深色 -->
<style>
/* ── 卡片背景 ── */
.ai-settings-content .panel-card,
.ai-settings-content .sidebar-card,
.ai-settings-content .panel-shell,
.ai-settings-content .model-card {
  background: var(--shell-bg-elevated, #1e293b) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  box-shadow: none !important;
}

/* ── 内部元素 ── */
.ai-settings-content .provider-item,
.ai-settings-content .model-item,
.ai-settings-content .status-text {
  background: var(--shell-bg, #0f172a) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.ai-settings-content .provider-item:hover,
.ai-settings-content .model-item:hover {
  background: var(--shell-bg-hover, #334155) !important;
}

.ai-settings-content .provider-item.active {
  background: rgba(24, 160, 88, 0.1) !important;
  border-color: var(--shell-active, #18a058) !important;
}
</style>
