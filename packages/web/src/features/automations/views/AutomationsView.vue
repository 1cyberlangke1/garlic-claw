<template>
  <div class="automations-view">
    <div class="automations-header">
      <h1><Icon :icon="cpuBoltBold" class="hero-icon" aria-hidden="true" />自动化</h1>
      <ElButton @click="showCreate = !showCreate">
        {{ showCreate ? '取消' : '+ 新建自动化' }}
      </ElButton>
    </div>

    <!-- 创建表单 -->
    <div v-if="showCreate" class="create-form">
      <div class="field">
        <label>名称</label>
        <ElInput v-model="form.name" placeholder="例如：每5分钟检查系统信息" />
      </div>
      <div class="field">
        <label>触发方式</label>
        <ElSelect v-model="form.triggerType">
          <ElOption label="定时执行" value="cron" />
          <ElOption label="手动触发" value="manual" />
          <ElOption label="事件触发" value="event" />
        </ElSelect>
      </div>
      <div v-if="form.triggerType === 'cron'" class="field">
        <label>执行间隔</label>
        <ElInput v-model="form.cronInterval" placeholder="例如: 5m, 1h, 30s" />
        <span class="hint">支持标准 cron 表达式，也兼容 30s / 5m / 1h</span>
      </div>
      <div v-if="form.triggerType === 'event'" class="field">
        <label>事件名称</label>
        <ElInput v-model="form.eventName" placeholder="例如: coffee.ready" />
        <span class="hint">当插件或宿主发出同名自动化事件时执行</span>
      </div>
      <div class="field">
        <label>动作类型</label>
        <ElSelect v-model="form.actionType">
          <ElOption label="设备命令" value="device_command" />
          <ElOption label="发送消息" value="ai_message" />
        </ElSelect>
      </div>
      <div v-if="form.actionType === 'device_command'" class="field">
        <label>动作：设备命令</label>
        <ElInput v-model="form.plugin" placeholder="插件名称 (如 pc-NOTEBOOK)" />
        <ElInput
          v-model="form.capability"
          placeholder="能力名称 (如 get_pc_info)"
          class="field-gap-top"
        />
      </div>
      <div v-else class="field">
        <label>动作：发送消息</label>
        <ElInput
          v-model="form.message"
          type="textarea"
          :rows="3"
          placeholder="例如：咖啡已经煮好了，记得趁热喝。"
        />
        <template v-if="form.triggerType === 'cron'">
          <ElSelect v-model="form.targetConversationMode" class="field-gap-top">
            <ElOption label="自动创建 cron 会话" value="cron_child" />
            <ElOption label="写入已有会话" value="existing" />
          </ElSelect>
        </template>
        <ElSelect v-model="form.targetConversationId" class="field-gap-top">
          <ElOption
            disabled
            value=""
            :label="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child' ? '请选择父会话' : '请选择目标会话'"
          />
          <ElOption
            v-for="conversation in conversations"
            :key="conversation.id"
            :label="conversation.title"
            :value="conversation.id"
          />
        </ElSelect>
        <div v-if="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child'" class="field nested-field">
          <label>历史会话保留数量</label>
          <ElInputNumber
            v-model.number="form.maxHistoryConversations"
            :min="1"
            :step="1"
            controls-position="right"
          />
        </div>
        <span class="hint">
          <template v-if="form.triggerType === 'cron' && form.targetConversationMode === 'cron_child'">
            每次 cron 触发都会在选中的父会话下新建一个子会话，并只保留最近设定数量的历史。
          </template>
          <template v-else>
            自动化会把消息写回选中的会话。
          </template>
          <template v-if="conversations.length === 0">没有可用会话，请先创建对话</template>
        </span>
      </div>
      <ElButton type="primary" :disabled="!canCreate" @click="handleCreate">创建</ElButton>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="automations.length === 0 && !showCreate" class="empty">
      <p>暂无自动化规则</p>
      <p class="hint">可以通过上方按钮创建，或在对话中让 AI 帮你创建</p>
    </div>

    <div v-else class="automation-list">
      <div
        v-for="auto in automations"
        :key="auto.id"
        class="automation-swipe-item"
        @touchstart.passive="(e) => onTouchStart(e, auto.id)"
        @touchmove="(e) => onTouchMove(e, auto.id)"
        @touchend="() => onTouchEnd(auto.id)"
        @touchcancel="() => onTouchEnd(auto.id)"
        @mousedown="(e) => onTouchStart(e, auto.id)"
        @mousemove="(e) => onTouchMove(e, auto.id)"
        @mouseup="() => onTouchEnd(auto.id)"
        @mouseleave="() => onTouchEnd(auto.id)"
      >
        <!-- 左侧操作按钮（右滑显示）- 启用/停用 -->
        <div class="swipe-action left-action" :style="getLeftActionStyle(auto.id)">
          <Icon :icon="auto.enabled ? closeCircleBold : checkCircleBold" :width="24" />
          <span class="action-text">{{ auto.enabled ? '停用' : '启用' }}</span>
        </div>

        <!-- 右侧操作按钮（左滑显示）- 删除 -->
        <div class="swipe-action right-action" :style="getRightActionStyle(auto.id)">
          <Icon :icon="trashBold" :width="24" />
          <span class="action-text">删除</span>
        </div>

        <!-- 自动化卡片 -->
        <div
          class="automation-card"
          :class="{ disabled: !auto.enabled }"
          :style="getCardStyle(auto.id)"
          @click="handleCardClick(auto)"
        >
          <!-- 头部 -->
          <div class="card-header">
            <div class="header-left">
              <h3 class="card-title">{{ auto.name }}</h3>
              <span class="status-badge" :class="auto.enabled ? 'enabled' : 'disabled'">
                {{ auto.enabled ? '运行中' : '已停用' }}
              </span>
            </div>
            <ElButton
              size="small"
              :type="auto.enabled ? '' : 'success'"
              plain
              @click.stop="handleRun(auto.id)"
              :disabled="!auto.enabled"
            >
              ▶ 运行
            </ElButton>
          </div>

          <!-- 详情 -->
          <div class="card-detail">
            <span class="trigger-badge">
              {{
                auto.trigger.type === 'cron'
                  ? `⏰ 每 ${auto.trigger.cron}`
                  : auto.trigger.type === 'event'
                    ? `⚡ 事件 ${auto.trigger.event}`
                    : '🔘 手动'
              }}
            </span>
            <span class="actions-list">
              <span v-for="(action, i) in auto.actions" :key="i" class="action-tag">
                {{ describeAction(action) }}
              </span>
            </span>
          </div>

          <!-- 底部信息 -->
          <div class="card-footer">
            <span v-if="auto.lastRunAt" class="last-run">
              上次运行: {{ formatTime(auto.lastRunAt) }}
            </span>
            <span v-else class="last-run never">尚未运行</span>
          </div>

          <!-- 最近日志 -->
          <div v-if="auto.logs?.length" class="logs">
            <div v-for="log in auto.logs.slice(0, 3)" :key="log.id" class="log-entry" :class="log.status">
              <span class="log-status">{{ log.status === 'success' ? '✓' : '✗' }}</span>
              <span class="log-time">{{ formatTime(log.createdAt) }}</span>
              <span v-if="log.result" class="log-result">{{ truncate(log.result, 60) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { Icon } from '@iconify/vue'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import closeCircleBold from '@iconify-icons/solar/close-circle-bold'
import checkCircleBold from '@iconify-icons/solar/check-circle-bold'
import trashBold from '@iconify-icons/solar/trash-bin-trash-bold'
import { ElButton, ElInput, ElInputNumber, ElMessageBox, ElOption, ElSelect } from 'element-plus'
import { useAutomations } from '@/features/automations/composables/use-automations'
import type { AutomationInfo } from '@garlic-claw/shared'

const {
  automations,
  conversations,
  loading,
  showCreate,
  form,
  canCreate,
  handleCreate,
  handleToggle,
  handleRun,
  handleDelete,
  describeAction,
  formatTime,
  truncate,
} = useAutomations()

// 滑动状态
const swipeState = reactive<Record<string, {
  offset: number
  startX: number
  startY: number
  isDragging: boolean
  hasMoved: boolean
}>>({})

const SWIPE_THRESHOLD = 80
const MAX_OFFSET = 120

function initSwipeState(id: string) {
  if (!swipeState[id]) {
    swipeState[id] = { offset: 0, startX: 0, startY: 0, isDragging: false, hasMoved: false }
  }
}

function onTouchStart(e: Event, id: string) {
  initSwipeState(id)
  const state = swipeState[id]
  state.isDragging = true

  if (e instanceof TouchEvent) {
    state.startX = e.touches[0].clientX
    state.startY = e.touches[0].clientY
  } else if (e instanceof MouseEvent) {
    state.startX = e.clientX
    state.startY = e.clientY
  }
}

function onTouchMove(e: Event, id: string) {
  const state = swipeState[id]
  if (!state?.isDragging) return

  let clientX = 0
  let clientY = 0
  if (e instanceof TouchEvent) {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else if (e instanceof MouseEvent) {
    clientX = e.clientX
    clientY = e.clientY
  }

  const deltaX = clientX - state.startX
  const deltaY = clientY - state.startY

  // 垂直滑动优先时忽略
  if (Math.abs(deltaY) > Math.abs(deltaX)) return

  if (Math.abs(deltaX) > 5) {
    state.hasMoved = true
  }

  if (e instanceof TouchEvent && Math.abs(deltaX) > 10) {
    e.preventDefault()
  }

  state.offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, deltaX))
}

function onTouchEnd(id: string) {
  const state = swipeState[id]
  if (!state) return

  const hadMoved = state.hasMoved
  state.isDragging = false

  if (hadMoved) {
    setTimeout(() => {
      state.hasMoved = false
    }, 50)
  } else {
    state.hasMoved = false
  }

  const auto = automations.value.find(a => a.id === id)
  if (!auto) {
    state.offset = 0
    return
  }

  // 右滑 → 启用/停用
  if (state.offset > SWIPE_THRESHOLD) {
    handleToggle(id)
    state.offset = 0
    return
  }

  // 左滑 → 删除
  if (state.offset < -SWIPE_THRESHOLD) {
    const name = auto.name || '未命名自动化'
    ElMessageBox.confirm(
      `确定要删除「${name}」吗？删除后无法恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
      .then(() => handleDelete(id))
      .catch(() => {})
    state.offset = 0
    return
  }

  state.offset = 0
}

function handleCardClick(auto: AutomationInfo) {
  const state = swipeState[auto.id]
  if (state?.hasMoved) return
}

function getCardStyle(id: string) {
  const state = swipeState[id]
  if (!state) return {}
  return {
    transform: `translateX(${state.offset}px)`,
    transition: state.isDragging ? 'none' : 'transform 0.3s ease',
  }
}

function getLeftActionStyle(id: string) {
  const state = swipeState[id]
  if (!state) return { opacity: 0 }
  const opacity = Math.min(1, Math.max(0, state.offset / SWIPE_THRESHOLD))
  return {
    opacity,
    transform: `scale(${0.8 + opacity * 0.2})`,
  }
}

function getRightActionStyle(id: string) {
  const state = swipeState[id]
  if (!state) return { opacity: 0 }
  const opacity = Math.min(1, Math.max(0, -state.offset / SWIPE_THRESHOLD))
  return {
    opacity,
    transform: `scale(${0.8 + opacity * 0.2})`,
  }
}
</script>

<style scoped>
.automations-view {
  padding: 1.5rem 2rem;
  overflow-y: auto;
  height: 100%;
}

.automations-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  margin-bottom: 1.5rem;
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.loading, .empty {
  text-align: center;
  padding: 3rem 0;
  color: var(--text-muted);
}

.empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

/* 创建表单 */
.create-form {
  background: var(--surface-panel);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: 1.2rem;
  border-radius: var(--radius);
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
}

.create-form .field {
  margin-bottom: 0.8rem;
}

.create-form .nested-field {
  margin-top: 0.8rem;
  margin-bottom: 0;
}

.field-gap-top {
  margin-top: 0.4rem;
}

.create-form label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.3rem;
}

.create-form .hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
  display: block;
}

/* 自动化列表 */
.automation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 滑动容器 */
.automation-swipe-item {
  position: relative;
  touch-action: pan-y;
  user-select: none;
}

/* 滑动操作按钮 */
.swipe-action {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  border-radius: 12px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  pointer-events: none;
}

.left-action {
  left: 0;
  background: linear-gradient(90deg, var(--success) 0%, #74d8a8 100%);
}

.right-action {
  right: 0;
  background: linear-gradient(270deg, #f36c6c 0%, #f89898 100%);
}

.action-text {
  margin-top: 4px;
  font-size: 11px;
  white-space: nowrap;
}

/* 自动化卡片 */
.automation-card {
  position: relative;
  z-index: 1;
  background: var(--surface-panel);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-left: 3px solid var(--success);
  border-radius: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--success);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.automation-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1), 0 0 20px rgba(103, 199, 207, 0.12);
}

.automation-card:active {
  cursor: grabbing;
}

.automation-card.disabled {
  border-left-color: #909399;
  opacity: 0.65;
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  flex-shrink: 0;
}

.status-badge.enabled {
  background: var(--surface-success-soft);
  color: var(--success);
}

.status-badge.disabled {
  background: var(--surface-panel-muted);
  color: var(--text-muted);
}

/* 详情 */
.card-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.trigger-badge {
  font-size: 12px;
  color: var(--accent);
  flex-shrink: 0;
}

.actions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.action-tag {
  background: var(--bg-input);
  padding: 0.15em 0.5em;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* 底部 */
.card-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.last-run {
  font-size: 12px;
  color: var(--text-muted);
}

.last-run.never {
  font-style: italic;
  opacity: 0.7;
}

/* 最近日志 */
.logs {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.log-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  padding: 0.15em 0;
}

.log-entry.success .log-status {
  color: var(--success);
}

.log-entry.error .log-status {
  color: var(--danger);
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-result {
  color: var(--text-muted);
  font-family: 'Cascadia Code', monospace;
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 响应式 */
@media (max-width: 840px) {
  .automations-view {
    padding: 1rem;
  }

  .automations-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .card-detail {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
