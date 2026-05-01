import { onMounted, ref } from 'vue'
import type {
  AiDefaultProviderSelection,
  AiHostModelRoutingConfig,
  AiModelConfig,
  AiProviderCatalogItem,
  AiProviderConfig,
  AiProviderSummary,
  DiscoveredAiModel,
  PluginConfigSnapshot,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { emitInternalConfigChanged } from '@/features/ai-settings/internal-config-change'
import {
  addProviderModel,
  deleteProviderConfig,
  deleteProviderModel,
  discoverProviderModels,
  formatConnectionSuccess,
  importDiscoveredProviderModels,
  loadProviderModelOptions,
  loadProviderSettingsBaseData,
  loadProviderSelectionData,
  saveHostModelRouting,
  saveProviderModelContextLength,
  saveProviderModelCapabilities,
  saveProviderConfig,
  saveSubagentConfig as saveSubagentConfigRequest,
  saveRuntimeToolsConfig as saveRuntimeToolsConfigRequest,
  saveContextGovernanceConfig as saveContextGovernanceConfigRequest,
  saveAiDefaultProviderSelection,
  saveVisionFallbackConfig,
  testProviderConnection as testProviderConnectionRequest,
  toErrorMessage,
  type HostModelRoutingOption,
  type ProviderConnectionResult,
  type VisionModelOption,
} from '@/features/ai-settings/composables/provider-settings.data'

/**
 * ProviderSettings 页面的状态与行为。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - provider / model / vision fallback 所需的响应式状态和操作函数
 * 预期行为:
 * - 页面只负责渲染
 * - 所有数据拉取、选择与保存逻辑集中到此 composable
 */
export function useProviderSettings() {
  const providerRequestState = useAsyncState(false)
  const loadingProviders = providerRequestState.loading
  const error = providerRequestState.error
  const appError = providerRequestState.appError
  const savingVision = ref(false)
  const savingHostModelRoutingConfig = ref(false)
  const savingRuntimeToolsConfig = ref(false)
  const savingSubagentConfig = ref(false)
  const savingContextGovernanceConfig = ref(false)
  const discoveringModels = ref(false)
  const testingConnection = ref(false)
  const catalog = ref<AiProviderCatalogItem[]>([])
  const defaultSelection = ref<AiDefaultProviderSelection>({
    providerId: null,
    modelId: null,
    source: 'default',
  })
  const providers = ref<AiProviderSummary[]>([])
  const selectedProviderId = ref<string | null>(null)
  const selectedProvider = ref<AiProviderConfig | null>(null)
  const selectedModels = ref<AiModelConfig[]>([])
  const providerModelsByProviderId = ref<Record<string, AiModelConfig[]>>({})
  const visionConfig = ref<VisionFallbackConfig>({ enabled: false })
  const hostModelRoutingConfig = ref<AiHostModelRoutingConfig>({
    fallbackChatModels: [],
    utilityModelRoles: {},
  })
  const runtimeToolsConfigSnapshot = ref<PluginConfigSnapshot | null>(null)
  const subagentConfigSnapshot = ref<PluginConfigSnapshot | null>(null)
  const contextGovernanceConfigSnapshot = ref<PluginConfigSnapshot | null>(null)
  const visionOptions = ref<VisionModelOption[]>([])
  const hostModelRoutingOptions = ref<HostModelRoutingOption[]>([])
  const showProviderDialog = ref(false)
  const showDiscoveryDialog = ref(false)
  const editingProvider = ref<AiProviderConfig | null>(null)
  const discoveredModels = ref<DiscoveredAiModel[]>([])
  const connectionResult = ref<ProviderConnectionResult | null>(null)
  let providerSelectionRequestId = 0
  let providerModelOptionsRequestId = 0
  let discoveryRequestId = 0
  let connectionTestRequestId = 0
  let hostModelRoutingRequestId = 0
  let refreshAllRequestId = 0

  function emitProviderModelsChanged() {
    emitInternalConfigChanged({ scope: 'provider-models' })
  }

  onMounted(() => {
    void refreshAll()
  })

  async function refreshAll(preferredProviderId?: string) {
    const requestId = ++refreshAllRequestId
    loadingProviders.value = true
    providerRequestState.clearError()
    try {
      const baseData = await loadProviderSettingsBaseData()
      if (requestId !== refreshAllRequestId) {
        return
      }
      catalog.value = baseData.catalog
      defaultSelection.value = baseData.defaultSelection
      providers.value = baseData.providers
      visionConfig.value = baseData.visionConfig
      hostModelRoutingConfig.value = baseData.hostModelRoutingConfig ?? {
        fallbackChatModels: [],
        utilityModelRoles: {},
      }
      runtimeToolsConfigSnapshot.value = baseData.runtimeToolsConfigSnapshot
      subagentConfigSnapshot.value = baseData.subagentConfigSnapshot
      contextGovernanceConfigSnapshot.value = baseData.contextGovernanceConfigSnapshot
      providerModelsByProviderId.value = Object.fromEntries(
        Object.entries(providerModelsByProviderId.value).filter(([providerId]) =>
          baseData.providers.some((provider) => provider.id === providerId),
        ),
      )
      const selectedSelection = await selectAvailableProvider(preferredProviderId)
      if (requestId !== refreshAllRequestId) {
        return
      }
      await refreshProviderModelOptions(selectedSelection)
    } catch (caughtError) {
      if (requestId !== refreshAllRequestId) {
        return
      }
      providerRequestState.setError(caughtError, '加载失败')
    } finally {
      if (requestId === refreshAllRequestId) {
        loadingProviders.value = false
      }
    }
  }

  /**
   * 根据当前选择或首个可用 provider 同步右侧详情。
   */
  async function selectAvailableProvider(preferredProviderId?: string) {
    const preferred = preferredProviderId
      ? providers.value.find((provider) => provider.id === preferredProviderId)
      : undefined
    const current = providers.value.find(
      (provider) => provider.id === selectedProviderId.value,
    )
    const next = preferred ?? current ?? providers.value[0]

    if (!next) {
      selectedProviderId.value = null
      selectedProvider.value = null
      selectedModels.value = []
      return null
    }

    return selectProvider(next.id)
  }

  async function selectProvider(providerId: string) {
    const requestId = ++providerSelectionRequestId
    const isProviderSwitch = selectedProviderId.value !== providerId
    discoveryRequestId += 1
    connectionTestRequestId += 1
    selectedProviderId.value = providerId
    if (isProviderSwitch) {
      selectedProvider.value = null
      selectedModels.value = []
      discoveredModels.value = []
      showDiscoveryDialog.value = false
      discoveringModels.value = false
      testingConnection.value = false
      connectionResult.value = null
    }
    const selectionData = await loadProviderSelectionData(providerId)
    if (
      requestId !== providerSelectionRequestId ||
      selectedProviderId.value !== providerId
    ) {
      return
    }

    selectedProvider.value = selectionData.provider
    selectedModels.value = selectionData.models
    providerModelsByProviderId.value = {
      ...providerModelsByProviderId.value,
      [selectionData.provider.id]: selectionData.models,
    }
    return selectionData
  }

  function openCreateDialog() {
    editingProvider.value = null
    showProviderDialog.value = true
  }

  function openEditDialog() {
    if (!selectedProvider.value) {
      return
    }
    editingProvider.value = selectedProvider.value
    showProviderDialog.value = true
  }

  async function saveProvider(provider: AiProviderConfig) {
    showProviderDialog.value = false
    await saveProviderConfig(provider)
    await refreshAll(provider.id)
    emitProviderModelsChanged()
  }

  async function deleteSelectedProvider() {
    if (!selectedProvider.value) {
      return
    }
    await deleteProviderConfig(selectedProvider.value.id)
    await refreshAll()
    emitProviderModelsChanged()
  }

  async function addModel(payload: { modelId: string; name?: string }) {
    if (!selectedProvider.value) {
      return
    }
    await addProviderModel(selectedProvider.value.id, payload.modelId, payload.name)
    await reloadSelectedProvider(selectedProvider.value.id)
    emitProviderModelsChanged()
  }

  /**
   * 拉取远程模型列表并打开选择弹窗。
   */
  async function openDiscoveryDialog() {
    if (!selectedProvider.value) {
      return
    }

    const providerId = selectedProvider.value.id
    const requestId = ++discoveryRequestId
    discoveringModels.value = true
    connectionResult.value = null
    try {
      const models = await discoverProviderModels(providerId)
      if (
        requestId !== discoveryRequestId ||
        selectedProviderId.value !== providerId
      ) {
        return
      }

      discoveredModels.value = models
      showDiscoveryDialog.value = true
    } catch (caughtError) {
      if (
        requestId !== discoveryRequestId ||
        selectedProviderId.value !== providerId
      ) {
        return
      }

      connectionResult.value = {
        kind: 'error',
        text: toErrorMessage(caughtError, '拉取模型失败'),
      }
    } finally {
      if (requestId === discoveryRequestId) {
        discoveringModels.value = false
      }
    }
  }

  /**
   * 将用户勾选的已拉取模型批量导入当前 provider。
   * @param modelIds 选中的模型 ID 列表
   */
  async function importDiscoveredModels(modelIds: string[]) {
    if (!selectedProvider.value) {
      return
    }

    const providerId = selectedProvider.value.id
    showDiscoveryDialog.value = false
    await importDiscoveredProviderModels(
      providerId,
      discoveredModels.value,
      modelIds,
    )
    await reloadSelectedProvider(providerId)
    emitProviderModelsChanged()
  }

  async function deleteModel(modelId: string) {
    if (!selectedProvider.value) {
      return
    }
    await deleteProviderModel(selectedProvider.value.id, modelId)
    await reloadSelectedProvider(selectedProvider.value.id)
    emitProviderModelsChanged()
  }

  async function setDefaultModel(modelId: string) {
    if (!selectedProvider.value) {
      return
    }
    const providerId = selectedProvider.value.id
    const updatedSelection = await saveAiDefaultProviderSelection(
      providerId,
      modelId,
    )
    defaultSelection.value = updatedSelection
    selectedProvider.value = {
      ...selectedProvider.value,
      defaultModel: modelId,
    }
    providers.value = providers.value.map((provider) =>
      provider.id === providerId
        ? {
            ...provider,
            defaultModel: modelId,
          }
        : provider,
    )
    emitProviderModelsChanged()
  }

  /**
   * 更新模型能力，并同步刷新视觉模型候选列表。
   * @param payload 模型能力更新内容
   */
  async function updateCapabilities(payload: {
    modelId: string
    capabilities: AiModelConfig['capabilities']
  }) {
    if (!selectedProvider.value) {
      return
    }

    await saveProviderModelCapabilities(
      selectedProvider.value.id,
      payload.modelId,
      payload.capabilities,
    )
    await reloadSelectedProvider(selectedProvider.value.id)
    emitProviderModelsChanged()
  }

  async function updateContextLength(payload: {
    modelId: string
    contextLength: number
  }) {
    if (!selectedProvider.value) {
      return
    }

    await saveProviderModelContextLength(
      selectedProvider.value.id,
      payload.modelId,
      payload.contextLength,
    )
    await reloadSelectedProvider(selectedProvider.value.id)
    emitProviderModelsChanged()
  }

  /**
   * 发起 provider 测试连接请求，并格式化结果文本。
   */
  async function testProviderConnection() {
    if (!selectedProvider.value) {
      return
    }

    const providerId = selectedProvider.value.id
    const requestId = ++connectionTestRequestId
    testingConnection.value = true
    connectionResult.value = null
    try {
      const result = await testProviderConnectionRequest(
        providerId,
        selectedProvider.value.defaultModel,
      )
      if (
        requestId !== connectionTestRequestId ||
        selectedProviderId.value !== providerId
      ) {
        return
      }

      connectionResult.value = {
        kind: 'success',
        text: formatConnectionSuccess(result),
      }
    } catch (caughtError) {
      if (
        requestId !== connectionTestRequestId ||
        selectedProviderId.value !== providerId
      ) {
        return
      }

      connectionResult.value = {
        kind: 'error',
        text: toErrorMessage(caughtError, '测试连接失败'),
      }
    } finally {
      if (requestId === connectionTestRequestId) {
        testingConnection.value = false
      }
    }
  }

  async function saveVisionConfig(config: VisionFallbackConfig) {
    savingVision.value = true
    try {
      visionConfig.value = await saveVisionFallbackConfig(config)
      emitInternalConfigChanged({ scope: 'vision-fallback' })
    } finally {
      savingVision.value = false
    }
  }

  async function saveHostModelRoutingConfig(config: AiHostModelRoutingConfig) {
    const requestId = ++hostModelRoutingRequestId
    savingHostModelRoutingConfig.value = true
    try {
      const nextConfig = await saveHostModelRouting(config)
      if (requestId !== hostModelRoutingRequestId) {
        return
      }
      hostModelRoutingConfig.value = nextConfig
    } finally {
      if (requestId === hostModelRoutingRequestId) {
        savingHostModelRoutingConfig.value = false
      }
    }
  }

  async function saveRuntimeToolsConfig(values: PluginConfigSnapshot['values']) {
    savingRuntimeToolsConfig.value = true
    try {
      runtimeToolsConfigSnapshot.value = await saveRuntimeToolsConfigRequest(values)
      emitInternalConfigChanged({ scope: 'runtime-tools' })
    } finally {
      savingRuntimeToolsConfig.value = false
    }
  }

  async function saveSubagentConfig(values: PluginConfigSnapshot['values']) {
    savingSubagentConfig.value = true
    try {
      subagentConfigSnapshot.value = await saveSubagentConfigRequest(values)
      emitInternalConfigChanged({ scope: 'subagent' })
    } finally {
      savingSubagentConfig.value = false
    }
  }

  async function saveContextGovernanceConfig(values: PluginConfigSnapshot['values']) {
    savingContextGovernanceConfig.value = true
    try {
      contextGovernanceConfigSnapshot.value = await saveContextGovernanceConfigRequest(values)
      emitInternalConfigChanged({ scope: 'context-governance' })
    } finally {
      savingContextGovernanceConfig.value = false
    }
  }

  /**
   * 重新构建 provider 相关模型候选列表。
   */
  async function refreshProviderModelOptions(
    selectionData?: Awaited<ReturnType<typeof loadProviderSelectionData>> | null,
  ) {
    const requestId = ++providerModelOptionsRequestId
    const options = await loadProviderModelOptions({
      providers: providers.value,
      preloadedModelsByProviderId: {
        ...providerModelsByProviderId.value,
        ...(selectionData?.provider
          ? {
              [selectionData.provider.id]: selectionData.models,
            }
          : {}),
      },
    })
    if (requestId !== providerModelOptionsRequestId) {
      return
    }
    providerModelsByProviderId.value = options.modelsByProviderId
    visionOptions.value = options.visionOptions
    hostModelRoutingOptions.value = options.hostModelRoutingOptions
  }

  async function reloadSelectedProvider(providerId?: string) {
    const targetProviderId =
      providerId ?? selectedProvider.value?.id ?? selectedProviderId.value
    if (!targetProviderId) {
      await refreshProviderModelOptions(null)
      return null
    }

    const selectionData = await selectProvider(targetProviderId)
    await refreshProviderModelOptions(selectionData)
    return selectionData
  }

  return {
    loadingProviders,
    savingVision,
    savingHostModelRoutingConfig,
    savingRuntimeToolsConfig,
    savingSubagentConfig,
    savingContextGovernanceConfig,
    discoveringModels,
    testingConnection,
    error,
    appError,
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
  }
}
