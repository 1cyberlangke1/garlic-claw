<template>
  <div class="plugins-page">
    <PluginPageHero
      v-model:current-view="currentView"
      :view-options="viewOptions"
      :headline="heroHeadline"
      :cards="overviewCards"
      @refresh="refreshAll"
    />

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <PluginAttentionPanel
      :plugins="attentionPlugins"
      :running-action="runningAction"
      @select-plugin="selectPlugin"
      @run-action="runActionForPlugin"
    />

    <div class="plugins-layout">
      <PluginSidebar
        :plugins="plugins"
        :loading="loading"
        :selected-plugin-name="selectedPluginName"
        :error="null"
        @refresh="refreshAll"
        @select="selectPlugin"
      />

      <section v-if="selectedPlugin" class="plugin-detail">
        <PluginDetailOverview
          :plugin="selectedPlugin"
          :health="selectedPluginHealth"
          :actions="selectedPluginActions"
          :running-action="runningAction"
          :detail-loading="detailLoading"
          :deleting="deleting"
          :can-delete="canDeleteSelected"
          :cron-count="selectedCronJobs.length"
          :highlights="selectedPluginHighlights"
          @refresh-details="refreshSelectedDetails()"
          @run-action="runAction"
          @delete-selected="deleteSelectedPlugin"
        />

        <div v-if="currentView === 'manage'" class="detail-grid">
          <PluginRemoteSummaryPanel
            v-if="selectedPlugin.remote"
            :plugin="selectedPlugin"
          />
          <PluginRemoteAccessPanel
            v-if="selectedPlugin.remote"
            :plugin="selectedPlugin"
            :saving="savingRemoteAccess"
            @save="saveRemoteAccess"
          />
          <SchemaConfigForm
            :snapshot="configSnapshot"
            :saving="savingConfig"
            title="插件配置"
            description="宿主按插件声明的配置元数据统一渲染，不再依赖扁平字段表单。"
            empty-text="插件没有声明配置元数据。"
            @save="saveConfig"
          />
          <PluginLlmPreferencePanel
            v-if="selectedPluginUsesLlm"
            :preference="llmPreference"
            :providers="llmProviders"
            :options="llmOptions"
            :saving="savingLlmPreference"
            @save="saveLlmPreference"
          />
          <PluginScopeEditor
            :plugin="selectedPlugin"
            :scope="scopeSettings"
            :saving="savingScope"
            @save="saveScope"
          />
          <EventLogSettingsPanel
            :settings="selectedPlugin.eventLog"
            :saving="savingEventLog"
            title="插件日志设置"
            description="此插件的事件日志会写入 log/plugins/<pluginId>/ 目录。"
            @save="saveEventLog"
          />
          <article class="detail-span tool-management-entry">
            <div class="tool-management-entry-copy">
              <h3>工具管理入口</h3>
              <p>插件工具启用/禁用已统一移到工具管理页。当前页继续处理配置、作用域、日志和远程接入。</p>
            </div>
            <a class="tool-management-entry-link" :href="selectedPluginToolManagementHref">
              打开工具管理
            </a>
          </article>
          <PluginStoragePanel
            class="detail-span"
            :entries="storageEntries"
            :prefix="storagePrefix"
            :loading="detailLoading"
            :saving="savingStorage"
            :deleting-key="deletingStorageKey"
            @refresh="refreshPluginStorage"
            @save="saveStorageEntry"
            @delete="deleteStorageEntry"
          />
          <PluginCronList
            class="detail-span"
            :jobs="selectedCronJobs"
            :deleting-job-id="deletingCronJobId"
            @delete="deleteCronJob"
          />
          <PluginConversationSessionList
            class="detail-span"
            :sessions="selectedConversationSessions"
            :finishing-conversation-id="finishingConversationId"
            @finish="finishConversationSession"
          />
          <PluginRouteList
            class="detail-span"
            :plugin-name="selectedPlugin.name"
            :routes="selectedPlugin.manifest.routes ?? []"
          />
        </div>

        <div v-else class="plugin-log-section">
          <PluginEventLog
            :events="eventLogs"
            :loading="detailLoading || eventLoading"
            :query="eventQuery"
            :next-cursor="eventNextCursor"
            @refresh="refreshPluginEvents"
            @load-more="loadMorePluginEvents"
          />
        </div>
      </section>

      <section v-else class="plugin-empty">
        <span class="empty-kicker">等待插件接入</span>
        <h2>暂无插件</h2>
        <p>启动本地插件或远程插件后，就可以在这里统一查看扩展面和健康快照。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginActionName, PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import PluginAttentionPanel from '@/modules/plugins/components/PluginAttentionPanel.vue'
import SchemaConfigForm from '@/modules/config/components/SchemaConfigForm.vue'
import PluginConversationSessionList from '@/modules/plugins/components/PluginConversationSessionList.vue'
import PluginCronList from '@/modules/plugins/components/PluginCronList.vue'
import PluginDetailOverview from '@/modules/plugins/components/PluginDetailOverview.vue'
import PluginEventLog from '@/modules/plugins/components/PluginEventLog.vue'
import PluginLlmPreferencePanel from '@/modules/plugins/components/PluginLlmPreferencePanel.vue'
import PluginPageHero from '@/modules/plugins/components/PluginPageHero.vue'
import PluginRemoteAccessPanel from '@/modules/plugins/components/PluginRemoteAccessPanel.vue'
import PluginRemoteSummaryPanel from '@/modules/plugins/components/PluginRemoteSummaryPanel.vue'
import PluginRouteList from '@/modules/plugins/components/PluginRouteList.vue'
import PluginScopeEditor from '@/modules/plugins/components/PluginScopeEditor.vue'
import PluginSidebar from '@/modules/plugins/components/PluginSidebar.vue'
import PluginStoragePanel from '@/modules/plugins/components/PluginStoragePanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import {
  hasPluginIssue,
  pluginAttentionWeight,
  pluginUsesHostLlm,
} from '@/modules/plugins/composables/plugin-management.helpers'
import { usePluginManagement } from '@/modules/plugins/composables/use-plugin-management'

type PluginsPageView = 'manage' | 'logs'

const route = useRoute()
const currentView = ref<PluginsPageView>('manage')
const viewOptions: ReadonlyArray<{ label: string; value: PluginsPageView }> = [
  { label: '管理', value: 'manage' },
  { label: '日志', value: 'logs' },
]
const preferredPluginName = computed(() => {
  const raw = route.query.plugin
  return typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : null
})

const {
  loading,
  detailLoading,
  savingConfig,
  savingEventLog,
  savingLlmPreference,
  savingRemoteAccess,
  savingStorage,
  savingScope,
  eventLoading,
  runningAction,
  deletingCronJobId,
  finishingConversationId,
  deletingStorageKey,
  deleting,
  error,
  plugins,
  selectedPluginName,
  selectedPlugin,
  configSnapshot,
  llmPreference,
  llmProviders,
  llmOptions,
  conversationSessions,
  cronJobs,
  scopeSettings,
  healthSnapshot,
  eventLogs,
  eventQuery,
  eventNextCursor,
  storageEntries,
  storagePrefix,
  canDeleteSelected,
  refreshAll,
  selectPlugin,
  refreshSelectedDetails,
  refreshPluginEvents,
  loadMorePluginEvents,
  refreshPluginStorage,
  deleteCronJob,
  finishConversationSession,
  saveConfig,
  saveEventLog,
  saveLlmPreference,
  saveRemoteAccess,
  saveStorageEntry,
  saveScope,
  runAction,
  deleteStorageEntry,
  deleteSelectedPlugin,
} = usePluginManagement({
  preferredPluginName,
})

const selectedPluginHighlights = computed(() =>
  selectedPlugin.value ? pluginHighlights(selectedPlugin.value) : [],
)
const selectedPluginHealth = computed<PluginHealthSnapshot | null>(() =>
  healthSnapshot.value ?? selectedPlugin.value?.health ?? null,
)
const selectedPluginActions = computed(() =>
  selectedPlugin.value ? pluginActions(selectedPlugin.value) : [],
)
const selectedPluginUsesLlm = computed(() =>
  selectedPlugin.value ? pluginUsesHostLlm(selectedPlugin.value) : false,
)
const selectedPluginToolManagementHref = computed(() => {
  const params = new URLSearchParams({ kind: 'plugin' })
  if (selectedPlugin.value?.name) {
    params.set('source', selectedPlugin.value.name)
  }

  return `/tools?${params.toString()}`
})
const selectedCronJobs = computed(() =>
  cronJobs.value.length > 0 ? cronJobs.value : selectedPlugin.value?.crons ?? [],
)
const selectedConversationSessions = computed(() => conversationSessions.value)
const attentionPlugins = computed(() =>
  [...plugins.value]
    .filter((plugin) => hasPluginIssue(plugin))
    .sort((left, right) => {
      const weightDiff = pluginAttentionWeight(left) - pluginAttentionWeight(right)
      if (weightDiff !== 0) {
        return weightDiff
      }

      return (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
    }),
)
const onlinePluginCount = computed(() =>
  plugins.value.filter((plugin) => plugin.connected).length,
)
const localPluginCount = computed(() =>
  plugins.value.filter((plugin) => (plugin.runtimeKind ?? 'remote') === 'local').length,
)
const remotePluginCount = computed(() =>
  Math.max(plugins.value.length - localPluginCount.value, 0),
)
const attentionPluginCount = computed(() =>
  plugins.value.filter((plugin) => needsAttention(plugin)).length,
)
const heroHeadline = computed(() => {
  const total = plugins.value.length
  const online = onlinePluginCount.value
  if (total === 0) {
    return '等待首个插件接入'
  }
  if (online === total) {
    return `${online} / ${total} 在线`
  }

  return `${online} / ${total} 在线，${total - online} 个离线`
})
const overviewCards = computed(() => {
  const total = plugins.value.length

  return [
    {
      label: '已接入插件',
      value: String(total),
      note: total > 0
        ? `本地 ${localPluginCount.value} · 远程 ${remotePluginCount.value}`
        : '本地与远程插件都会汇聚到这里',
      tone: 'accent',
    },
    {
      label: '在线插件',
      value: String(onlinePluginCount.value),
      note: total === 0
        ? '还没有建立运行中的插件连接'
        : onlinePluginCount.value === total
          ? '全部在线'
          : `${total - onlinePluginCount.value} 个离线`,
      tone: 'neutral',
    },
    {
      label: '需关注',
      value: String(attentionPluginCount.value),
      note: attentionPluginCount.value > 0
        ? '存在异常、降级或满并发插件'
        : '没有高优先级告警',
      tone: attentionPluginCount.value > 0 ? 'warning' : 'neutral',
    },
    {
      label: '焦点',
      value: selectedPlugin.value
        ? selectedPlugin.value.displayName ?? selectedPlugin.value.name
        : '未选择插件',
      note: selectedPlugin.value
        ? `${runtimeKindLabel(selectedPlugin.value)} · ${healthText(selectedPluginHealth.value)}`
        : '从左侧选择插件进入详情',
      tone: 'spotlight',
    },
  ]
})

const ACTION_LABELS: Record<PluginActionName, {
  label: string
  pendingLabel: string
}> = {
  'health-check': {
    label: '健康检查',
    pendingLabel: '检查中...',
  },
  reload: {
    label: '重载插件',
    pendingLabel: '重载中...',
  },
  reconnect: {
    label: '请求重连',
    pendingLabel: '重连中...',
  },
  'refresh-metadata': {
    label: '刷新元数据',
    pendingLabel: '刷新中...',
  },
}

/** 健康状态文本。 */
function healthText(health: PluginHealthSnapshot | null | undefined): string {
  switch (health?.status) {
    case 'healthy':
      return '健康'
    case 'degraded':
      return '降级'
    case 'error':
      return '异常'
    case 'offline':
      return '离线'
    default:
      return '未知'
  }
}

/** 运行形态标签。 */
function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'local' ? '本地插件' : '远程插件'
}

/** 判断插件是否需要关注。 */
function needsAttention(plugin: PluginInfo): boolean {
  return hasPluginIssue(plugin)
}

/** 根据权限与 Hook 推导插件能力标签。 */
function pluginHighlights(plugin: PluginInfo): string[] {
  const permissions = new Set(plugin.manifest.permissions)
  const hooks = new Set((plugin.manifest.hooks ?? []).map((hook) => hook.name))
  const highlights = new Set<string>()
  const pushHighlight = (label: string) => {
    highlights.add(label)
  }

  if (permissions.has('conversation:read')) {
    pushHighlight('可读取会话上下文')
  }
  if (permissions.has('conversation:write')) {
    pushHighlight('可修改会话标题')
  }
  if (permissions.has('provider:read')) {
    pushHighlight('可读取 Provider 上下文')
  }
  if (permissions.has('memory:read')) {
    pushHighlight('可读取用户记忆')
  }
  if (permissions.has('memory:write')) {
    pushHighlight('可写入用户记忆')
  }
  if (permissions.has('automation:read')) {
    pushHighlight('可读取自动化规则')
  }
  if (permissions.has('automation:write')) {
    pushHighlight('可管理和触发自动化')
  }
  if (permissions.has('kb:read')) {
    pushHighlight('可读取系统知识库')
  }
  if (permissions.has('persona:read')) {
    pushHighlight('可读取人设上下文')
  }
  if (permissions.has('persona:write')) {
    pushHighlight('可切换当前人设')
  }
  if (permissions.has('llm:generate')) {
    pushHighlight('可二次调用模型')
  }
  if (permissions.has('storage:read') || permissions.has('storage:write')) {
    pushHighlight('可读写持久化插件 KV')
  }
  if (permissions.has('state:read') || permissions.has('state:write')) {
    pushHighlight('可读写进程内状态')
  }
  if (permissions.has('log:write')) {
    pushHighlight('可写入宿主事件日志')
  }
  if (permissions.has('cron:read') || permissions.has('cron:write')) {
    pushHighlight('可管理宿主 Cron')
  }
  if (permissions.has('subagent:run')) {
    pushHighlight('可调用宿主子代理')
  }
  if (hooks.has('conversation:created')) {
    pushHighlight('可监听会话创建')
  }
  if (hooks.has('message:received')) {
    pushHighlight('可前置监听和过滤消息')
  }
  if (hooks.has('message:created')) {
    pushHighlight('可改写消息草稿')
  }
  if (hooks.has('message:updated')) {
    pushHighlight('可改写消息编辑结果')
  }
  if (hooks.has('message:deleted')) {
    pushHighlight('可监听消息删除')
  }
  if (hooks.has('automation:before-run')) {
    pushHighlight('可拦截自动化执行')
  }
  if (hooks.has('automation:after-run')) {
    pushHighlight('可改写或记录自动化结果')
  }
  if (hooks.has('tool:before-call')) {
    pushHighlight('可拦截工具调用参数')
  }
  if (hooks.has('tool:after-call')) {
    pushHighlight('可观察或改写工具结果')
  }
  if (hooks.has('response:before-send')) {
    pushHighlight('可改写最终发送内容')
  }
  if (hooks.has('response:after-send')) {
    pushHighlight('可观察最终发送结果')
  }
  if (hooks.has('plugin:loaded')) {
    pushHighlight('可监听插件加载')
  }
  if (hooks.has('plugin:unloaded')) {
    pushHighlight('可监听插件卸载')
  }
  if (hooks.has('plugin:error')) {
    pushHighlight('可观察插件失败事件')
  }
  if (hooks.has('chat:before-model')) {
    pushHighlight('可改写模型上下文')
    pushHighlight('可短路模型调用')
  }
  if (hooks.has('chat:waiting-model')) {
    pushHighlight('可观察模型等待态')
  }
  if (hooks.has('chat:after-model')) {
    pushHighlight('可消费并改写模型结果')
  }
  if ((plugin.crons?.length ?? 0) > 0) {
    pushHighlight('可定时执行任务')
  }
  if ((plugin.manifest.routes?.length ?? 0) > 0) {
    pushHighlight('可暴露宿主内 JSON 路由')
  }

  return [...highlights]
}

/** 映射插件声明的动作到按钮。 */
function pluginActions(plugin: PluginInfo): Array<{
  name: PluginActionName
  label: string
  pendingLabel: string
}> {
  const supportedActions = plugin.supportedActions ?? ['health-check']

  return supportedActions.map((action) => ({
    name: action,
    label: ACTION_LABELS[action].label,
    pendingLabel: ACTION_LABELS[action].pendingLabel,
  }))
}

async function runActionForPlugin(input: {
  pluginName: string
  action: PluginActionName
}) {
  if (selectedPluginName.value !== input.pluginName) {
    await selectPlugin(input.pluginName)
  }

  await runAction(input.action)
}
</script>

<style scoped src="./plugins-view.css"></style>
