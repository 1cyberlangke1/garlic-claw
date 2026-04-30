<template>
  <div class="chat-view">
    <template v-if="chat.currentConversationId">
      <div class="chat-toolbar" :class="{ collapsed: !toolbarExpanded }">
        <div class="toolbar-header">
          <div class="toolbar-input-wrap">
            <ModelQuickInput
              :model="chat.selectedModel"
              :provider="chat.selectedProvider"
              placeholder="选择 provider/model"
              @change="handleModelChange"
            />
          </div>
          <button
            type="button"
            class="toolbar-toggle"
            :title="toolbarExpanded ? '收起' : '展开'"
            @click="toolbarExpanded = !toolbarExpanded"
          >
            <Icon
              class="toolbar-toggle-icon"
              :icon="toolbarExpanded ? altArrowUpBold : altArrowDownBold"
              aria-hidden="true"
            />
          </button>
        </div>
        <template v-if="toolbarExpanded">
          <div v-if="selectedCapabilities" class="capability-row">
            <span v-if="selectedCapabilities.reasoning" class="capability-chip">推理</span>
            <span v-if="selectedCapabilities.toolCall" class="capability-chip">工具</span>
            <span v-if="selectedCapabilities.input.image" class="capability-chip">支持图片</span>
          </div>
        </template>
      </div>

      <div v-if="subagentTabs.length" class="chat-tabs">
        <button class="chat-tab" :class="{ active: activeTab === 'main' }" @click="switchToMainConversation">对话</button>
        <button v-for="s in subagentTabs" :key="s.id" class="chat-tab" :class="{ active: activeTab === s.id }" @click="switchToSubagent(s.id)">
          {{ s.title || '子代理' }}
        </button>
      </div>

      <section v-if="chat.todoItems.length > 0" class="chat-todo-panel">
        <div class="chat-todo-header">
          <h3>当前待办</h3>
          <span class="chat-todo-count">{{ chat.todoItems.length }}</span>
        </div>
        <div class="chat-todo-list">
          <div
            v-for="(item, index) in chat.todoItems"
            :key="`${index}-${item.content}`"
            class="chat-todo-item"
            :class="[`status-${item.status}`, `priority-${item.priority}`]"
          >
            <span class="chat-todo-state">{{ readTodoStatusLabel(item.status) }}</span>
            <span class="chat-todo-content">{{ item.content }}</span>
            <span class="chat-todo-priority">{{ readTodoPriorityLabel(item.priority) }}</span>
          </div>
        </div>
      </section>

      <ChatRuntimePermissionPanel
        :requests="pendingRuntimePermissions"
        @reply="replyRuntimePermission"
      />

      <ChatMessageList
        :assistant-persona="currentConversationPersona ? { avatar: currentConversationPersona.avatar, name: currentConversationPersona.name } : null"
        :context-window-preview="contextWindowPreview"
        :loading="chat.loading"
        :messages="displayedMessages"
        @delete-message="deleteMessage"
        @retry-message="retryMessage"
        @update-message="updateMessage"
      />


      <ChatComposer
        v-model="inputText"
        :can-send="canSend"
        :command-suggestions="commandSuggestions"
        :pending-images="pendingImages"
        :queued-send-count="queuedSendCount"
        :queued-send-preview-entries="queuedSendPreviewEntries"
        :streaming="chat.streaming"
        :upload-notices="uploadNotices"
        @apply-command-suggestion="applyCommandSuggestion"
        @file-change="handleFileChange"
        @pop-queued-send="popQueuedSendTailToInput"
        @remove-image="removeImage"
        @send="send"
        @stop="chat.stopStreaming()"
      />
    </template>

    <div v-else class="no-conversation">
      <p>👈 选择一个对话或创建新对话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import altArrowUpBold from '@iconify-icons/solar/alt-arrow-up-bold'
import altArrowDownBold from '@iconify-icons/solar/alt-arrow-down-bold'
import type { PluginPersonaCurrentInfo } from '@garlic-claw/shared'
import ModelQuickInput from '@/components/ModelQuickInput.vue'
import { useChatView } from '@/features/chat/composables/use-chat-view'
import ChatComposer from '@/features/chat/components/ChatComposer.vue'
import ChatMessageList from '@/features/chat/components/ChatMessageList.vue'
import ChatRuntimePermissionPanel from '@/features/chat/components/ChatRuntimePermissionPanel.vue'
import { loadCurrentPersona } from '@/features/personas/composables/persona-settings.data'
import { useChatStore } from '@/features/chat/store/chat'
import { isValidConversationRouteId } from '@/utils/uuid'

const chat = useChatStore()
const toolbarExpanded = ref(true)
const activeTab = ref('main')
const subagentTabs = ref<Array<{ id: string; title: string }>>([])
const workspaceConversationId = ref<string | null>(null)
const currentConversationPersona = ref<PluginPersonaCurrentInfo | null>(null)
const currentConversationId = computed(() => chat.currentConversationId ?? null)
const SUBAGENT_TAB_POLL_INTERVAL_MS = 2000

let subagentTabPollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  subagentTabPollTimer = setInterval(() => {
    const conversationId = workspaceConversationId.value
    if (!conversationId) {
      return
    }
    void refreshSubagentTabs(conversationId)
  }, SUBAGENT_TAB_POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (!subagentTabPollTimer) {
    return
  }
  clearInterval(subagentTabPollTimer)
  subagentTabPollTimer = null
})

watch(currentConversationId, async (id) => {
  if (!id) {
    activeTab.value = 'main'
    workspaceConversationId.value = null
    subagentTabs.value = []
    return
  }
  if (id === workspaceConversationId.value) {
    activeTab.value = 'main'
    return
  }
  if (subagentTabs.value.some((tab) => tab.id === id)) {
    activeTab.value = id
    return
  }
  activeTab.value = 'main'
  workspaceConversationId.value = id
  subagentTabs.value = []
  await refreshSubagentTabs(id)
}, {
  immediate: true,
})

function switchToMainConversation() {
  const conversationId = workspaceConversationId.value
  activeTab.value = 'main'
  if (!conversationId) {
    return
  }
  void chat.selectConversation(conversationId)
}

function switchToSubagent(conversationId: string) {
  activeTab.value = conversationId
  void chat.selectConversation(conversationId)
}

async function refreshSubagentTabs(conversationId: string) {
  try {
    const token = localStorage.getItem('accessToken')
    const resp = await fetch(`/api/chat/conversations/${conversationId}/subagents`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!resp.ok || workspaceConversationId.value !== conversationId) {
      return
    }
    subagentTabs.value = await resp.json()
  } catch {
    if (workspaceConversationId.value === conversationId) {
      subagentTabs.value = []
    }
  }
}

let currentPersonaRequestId = 0
const {
  inputText,
  pendingImages,
  commandSuggestions,
  displayedMessages,
  contextWindowPreview,
  pendingRuntimePermissions,
  queuedSendCount,
  queuedSendPreviewEntries,
  selectedCapabilities,
  uploadNotices,
  canSend,
  handleModelChange,
  send,
  handleFileChange,
  removeImage,
  updateMessage,
  deleteMessage,
  retryMessage,
  replyRuntimePermission,
  popQueuedSendTailToInput,
  applyCommandSuggestion,
} = useChatView(chat)

watch(
  currentConversationId,
  (conversationId) => {
    if (!conversationId || !isValidConversationRouteId(conversationId)) {
      currentConversationPersona.value = null
      return
    }
    const requestId = ++currentPersonaRequestId
    void readCurrentConversationPersona(conversationId, requestId)
  },
  {
    immediate: true,
  },
)

async function readCurrentConversationPersona(conversationId: string, requestId: number) {
  try {
    const persona = await loadCurrentPersona(conversationId)
    if (currentPersonaRequestId !== requestId || currentConversationId.value !== conversationId) {
      return
    }
    currentConversationPersona.value = persona
  } catch {
    if (currentPersonaRequestId !== requestId || currentConversationId.value !== conversationId) {
      return
    }
    currentConversationPersona.value = null
  }
}

function readTodoStatusLabel(status: "pending" | "in_progress" | "completed" | "cancelled") {
  switch (status) {
    case "in_progress":
      return "进行中"
    case "completed":
      return "已完成"
    case "cancelled":
      return "已取消"
    default:
      return "待处理"
  }
}

function readTodoPriorityLabel(priority: "high" | "medium" | "low") {
  switch (priority) {
    case "high":
      return "高"
    case "low":
      return "低"
    default:
      return "中"
  }
}
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.chat-tabs { display:flex; gap:4px; padding:0 4px; overflow-x:auto; flex-shrink:0; }
.chat-tab { display:flex; align-items:center; gap:6px; padding:6px 14px; border:1px solid var(--shell-border, #334155); border-radius:8px 8px 0 0; border-bottom:none; background:transparent; color:var(--shell-text-secondary, #cbd5e1); font-size:13px; cursor:pointer; white-space:nowrap; font-family:inherit; transition:all .12s; }
.chat-tab:hover { background:var(--shell-bg-hover, #334155); color:var(--shell-text, #f1f5f9); }
.chat-tab.active { background:var(--shell-bg-elevated, #1e293b); color:var(--shell-text, #f1f5f9); border-color:var(--shell-active, #22c55e); }
.chat-toolbar {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--header-gradient);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  flex-shrink: 0;
}

.toolbar-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-input-wrap {
  flex: 1;
  min-width: 0;
}

.toolbar-toggle {
  flex: 0 0 auto;
  width: 32px;
  align-self: stretch;
  border: 1px solid rgba(103, 199, 207, 0.2);
  border-radius: 8px;
  background: rgba(10, 19, 24, 0.38);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.toolbar-toggle:hover {
  opacity: 0.8;
}

.toolbar-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: currentColor;
}

.chat-toolbar.collapsed .toolbar-toggle {
  background: rgba(10, 19, 24, 0.62);
  border-color: rgba(103, 199, 207, 0.28);
  color: var(--accent-hover);
}

.capability-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.capability-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(89, 207, 155, 0.14);
  color: var(--success);
  font-size: 12px;
  font-weight: 500;
}

.service-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.service-label {
  font-size: 12px;
  color: var(--text-muted);
}

.service-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(76, 189, 255, 0.12);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.service-chip.disabled {
  background: rgba(255, 107, 107, 0.12);
  color: var(--danger);
}

.service-toggle {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 19, 24, 0.45);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.service-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.chat-todo-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(8, 15, 19, 0.78);
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.chat-todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-todo-header h3 {
  margin: 0;
  font-size: 14px;
}

.chat-todo-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(76, 189, 255, 0.12);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.chat-todo-list {
  display: grid;
  gap: 8px;
}

.chat-todo-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.chat-todo-item.status-completed,
.chat-todo-item.status-cancelled {
  opacity: 0.7;
}

.chat-todo-state {
  font-size: 12px;
  color: var(--text-muted);
}

.chat-todo-content {
  min-width: 0;
}

.chat-todo-priority {
  font-size: 12px;
  font-weight: 700;
}

.chat-todo-item.priority-high .chat-todo-priority {
  color: var(--danger);
}

.chat-todo-item.priority-medium .chat-todo-priority {
  color: var(--accent);
}

.chat-todo-item.priority-low .chat-todo-priority {
  color: var(--success);
}

.chat-todo-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.chat-view > :deep(.messages) { flex: 1; min-height: 0; overflow-y: auto; }

.subagent-view { display:flex; flex-direction:column; gap:12px; overflow-y:auto; }
.subagent-bar { display:flex; align-items:center; gap:10px; padding:8px 14px; background:var(--shell-bg-elevated); border-radius:6px; font-size:14px; color:var(--shell-text); }
.subagent-status { font-size:11px; padding:1px 8px; border-radius:999px; text-transform:uppercase; }
.subagent-status.queued,.subagent-status.running { background:rgba(245,158,11,.15); color:#f59e0b; }
.subagent-status.completed { background:rgba(34,197,94,.1); color:#22c55e; }
.subagent-status.error { background:rgba(239,68,68,.1); color:#ef4444; }
.subagent-msgs { display:grid; gap:8px; }
.subagent-msg { padding:10px 14px; border-radius:6px; background:var(--shell-bg-elevated); }
.subagent-msg.user { border-left:2px solid #3b82f6; }
.subagent-msg.assistant { border-left:2px solid #22c55e; }
.subagent-msg strong { display:block; margin-bottom:4px; font-size:11px; color:var(--shell-text-tertiary); text-transform:uppercase; }
.subagent-msg pre { margin:0; font-size:13px; color:var(--shell-text); white-space:pre-wrap; word-break:break-word; font-family:inherit; }
.subagent-tools { display:grid; gap:6px; margin-top:8px; }
.subagent-tool { padding:8px 12px; border-radius:4px; background:var(--shell-bg); }
.subagent-tool-name { font-size:11px; color:var(--shell-active); font-weight:500; }

.no-conversation {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-muted);
}
</style>
