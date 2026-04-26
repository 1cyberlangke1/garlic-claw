<template>
  <div class="settings-page">
    <header class="page-header">
      <div>
        <h1>AI 设置</h1>
        <p>统一管理供应商、模型能力和 Vision Fallback。</p>
      </div>
    </header>

    <div class="settings-grid">
      <AiProviderSidebar
        class="settings-sidebar"
        :catalog="catalog"
        :error="error"
        :loading="loadingProviders"
        :providers="providers"
        :selected-provider-id="selectedProviderId"
        @create="openCreateDialog"
        @refresh="refreshAll"
        @select="selectProvider"
      />

      <AiProviderModelsPanel
        class="settings-provider-panel"
        :catalog="catalog"
        :connection-result="connectionResult"
        :discovering-models="discoveringModels"
        :models="selectedModels"
        :provider="selectedProvider"
        :testing-connection="testingConnection"
        @add-model="addModel"
        @delete-model="deleteModel"
        @delete-provider="deleteSelectedProvider"
        @discover-models="openDiscoveryDialog"
        @edit-provider="openEditDialog"
        @set-default-model="setDefaultModel"
        @test-connection="testProviderConnection"
        @update-capabilities="updateCapabilities"
        @update-context-length="updateContextLength"
      />

      <VisionFallbackPanel
        class="settings-vision-panel"
        :config="visionConfig"
        :options="visionOptions"
        :saving="savingVision"
        @save="saveVisionConfig"
      />

      <HostModelRoutingPanel
        class="settings-routing-panel"
        :config="hostModelRoutingConfig"
        :options="hostModelRoutingOptions"
        :saving="false"
        @save="saveHostModelRoutingConfig"
      />

      <RuntimeToolsSettingsPanel
        class="settings-runtime-panel"
        :snapshot="runtimeToolsConfigSnapshot"
        :saving="savingRuntimeToolsConfig"
        @save="saveRuntimeToolsConfig"
      />

      <SubagentSettingsPanel
        class="settings-subagent-panel"
        :snapshot="subagentConfigSnapshot"
        :saving="savingSubagentConfig"
        @save="saveSubagentConfig"
      />

      <ContextGovernanceSettingsPanel
        class="settings-context-panel"
        :snapshot="contextGovernanceConfigSnapshot"
        :saving="savingContextGovernanceConfig"
        @save="saveContextGovernanceConfig"
      />

      <ToolGovernancePanel
        class="settings-runtime-governance-panel"
        source-kind="internal"
        source-id="runtime-tools"
        title="执行工具治理"
        description="统一查看内部 Runtime Tools 的启用状态。"
        :show-source-list="false"
        empty-title="内部执行工具未注册"
        empty-description="当前运行时还没有暴露内部 Runtime Tools。"
      />

      <ToolGovernancePanel
        class="settings-subagent-governance-panel"
        source-kind="internal"
        source-id="subagent"
        title="子代理治理"
        description="统一查看内部 Subagent 工具的启用状态。"
        :show-source-list="false"
        empty-title="内部子代理工具未注册"
        empty-description="当前运行时还没有暴露内部 Subagent 工具。"
      />
    </div>

    <AiProviderEditorDialog
      :catalog="catalog"
      :initial-config="editingProvider"
      :title="editingProvider ? '编辑 provider' : '新增 provider'"
      :visible="showProviderDialog"
      @close="showProviderDialog = false"
      @save="saveProvider"
    />

    <AiModelDiscoveryDialog
      :loading="discoveringModels"
      :models="discoveredModels"
      :title="selectedProvider ? `从 ${selectedProvider.name} 拉取并选择要添加的模型` : '拉取并选择模型'"
      :visible="showDiscoveryDialog"
      @add="importDiscoveredModels"
      @close="showDiscoveryDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import AiModelDiscoveryDialog from '@/features/ai-settings/components/AiModelDiscoveryDialog.vue'
import AiProviderEditorDialog from '@/features/ai-settings/components/AiProviderEditorDialog.vue'
import AiProviderModelsPanel from '@/features/ai-settings/components/AiProviderModelsPanel.vue'
import AiProviderSidebar from '@/features/ai-settings/components/AiProviderSidebar.vue'
import ContextGovernanceSettingsPanel from '@/features/ai-settings/components/ContextGovernanceSettingsPanel.vue'
import HostModelRoutingPanel from '@/features/ai-settings/components/HostModelRoutingPanel.vue'
import RuntimeToolsSettingsPanel from '@/features/ai-settings/components/RuntimeToolsSettingsPanel.vue'
import SubagentSettingsPanel from '@/features/ai-settings/components/SubagentSettingsPanel.vue'
import VisionFallbackPanel from '@/features/ai-settings/components/VisionFallbackPanel.vue'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'
import { useProviderSettings } from '@/features/ai-settings/composables/use-provider-settings'

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
  refreshAll,
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
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 18px;
  padding: 1.5rem 2rem;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.page-header h1,
.page-header p {
  margin: 0;
}

.page-header p {
  margin-top: 6px;
  color: var(--text-muted);
}

.settings-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  grid-template-areas:
    'sidebar provider'
    'vision vision'
    'routing routing'
    'runtime runtime'
    'subagent subagent'
    'context context'
    'runtime-governance runtime-governance'
    'subagent-governance subagent-governance';
  gap: 18px;
  min-width: 0;
}

.settings-sidebar,
.settings-provider-panel,
.settings-vision-panel {
  min-width: 0;
}

.settings-sidebar {
  grid-area: sidebar;
}

.settings-provider-panel {
  grid-area: provider;
}

.settings-vision-panel {
  /* 让 Vision Fallback 独占第二行整宽，避免继续挤在右侧下方。 */
  grid-area: vision;
}

.settings-routing-panel {
  grid-area: routing;
}

.settings-runtime-panel {
  grid-area: runtime;
}

.settings-subagent-panel {
  grid-area: subagent;
}

.settings-context-panel {
  grid-area: context;
}

.settings-runtime-governance-panel {
  grid-area: runtime-governance;
}

.settings-subagent-governance-panel {
  grid-area: subagent-governance;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      'sidebar'
      'provider'
      'vision'
      'routing'
      'runtime'
      'subagent'
      'context'
      'runtime-governance'
      'subagent-governance';
  }
}

@media (max-width: 720px) {
  .settings-page {
    padding: 1rem;
  }
}
</style>
