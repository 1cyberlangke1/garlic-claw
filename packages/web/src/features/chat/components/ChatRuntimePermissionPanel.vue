<script setup lang="ts">
import type { RuntimePermissionDecision } from '@garlic-claw/shared'
import type { ChatPendingRuntimePermission } from '@/features/chat/store/chat-store.types'

const props = defineProps<{
  requests: ChatPendingRuntimePermission[]
}>()

const emit = defineEmits<{
  reply: [requestId: string, decision: RuntimePermissionDecision]
}>()

function onReply(requestId: string, decision: RuntimePermissionDecision) {
  emit('reply', requestId, decision)
}

function formatCapabilityLabel(value: ChatPendingRuntimePermission['capabilities'][number]) {
  switch (value) {
    case 'workspaceRead':
      return '读取工作区'
    case 'workspaceWrite':
      return '写入工作区'
    case 'shellExecution':
      return '执行 Shell'
    case 'networkAccess':
      return '访问网络'
    case 'persistentFilesystem':
      return '持久文件系统'
    case 'persistentShellState':
      return '持久 Shell 状态'
    default:
      return value
  }
}
</script>

<template>
  <section v-if="props.requests.length > 0" class="permission-panel">
    <div class="permission-header">
      <h3>运行时权限审批</h3>
      <span class="permission-count">{{ props.requests.length }}</span>
    </div>
    <div class="permission-list">
      <article
        v-for="request in props.requests"
        :key="request.id"
        class="permission-card"
      >
        <div class="permission-main">
          <div class="permission-title-row">
            <strong>{{ request.toolName }}</strong>
            <span class="permission-backend">{{ request.backendKind }}</span>
          </div>
          <p class="permission-summary">{{ request.summary }}</p>
          <div class="permission-capabilities">
            <span
              v-for="capability in request.capabilities"
              :key="capability"
              class="capability-chip"
            >
              {{ formatCapabilityLabel(capability) }}
            </span>
          </div>
          <pre v-if="request.metadata !== undefined" class="permission-metadata">{{ JSON.stringify(request.metadata, null, 2) }}</pre>
        </div>
        <div class="permission-actions">
          <button
            type="button"
            class="permission-action"
            :disabled="request.resolving"
            @click="onReply(request.id, 'once')"
          >
            允许一次
          </button>
          <button
            type="button"
            class="permission-action"
            :disabled="request.resolving"
            @click="onReply(request.id, 'always')"
          >
            始终允许
          </button>
          <button
            type="button"
            class="permission-action danger"
            :disabled="request.resolving"
            @click="onReply(request.id, 'reject')"
          >
            拒绝
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.permission-panel {
  border: 1px solid rgba(255, 196, 87, 0.24);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, rgba(255, 196, 87, 0.12), rgba(255, 122, 69, 0.08)),
    rgba(8, 15, 19, 0.82);
  padding: 14px 16px;
  display: grid;
  gap: 12px;
}

.permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.permission-header h3 {
  margin: 0;
  font-size: 14px;
}

.permission-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 196, 87, 0.18);
  color: #ffd36f;
  font-size: 12px;
  font-weight: 700;
}

.permission-list {
  display: grid;
  gap: 10px;
}

.permission-card {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.permission-main {
  display: grid;
  gap: 8px;
}

.permission-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.permission-backend {
  font-size: 12px;
  color: var(--text-muted);
}

.permission-summary {
  margin: 0;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.permission-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.capability-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 196, 87, 0.14);
  color: #ffd36f;
  font-size: 12px;
  font-weight: 600;
}

.permission-metadata {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.22);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
}

.permission-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.permission-action {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 19, 24, 0.45);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.permission-action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.permission-action.danger {
  border-color: rgba(255, 107, 107, 0.28);
  color: var(--danger);
}
</style>
