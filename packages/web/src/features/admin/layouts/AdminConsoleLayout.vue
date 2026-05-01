<script setup lang="ts">
import ThemeToggle from '@/components/header/ThemeToggle.vue'
import { useAdminShellPreferences } from '@/features/admin/modules/admin-shell-preferences'
import { useAuthStore } from '@/stores/auth'
import altArrowLeftBold from '@iconify-icons/solar/alt-arrow-left-bold'
import altArrowRightBold from '@iconify-icons/solar/alt-arrow-right-bold'
import chatRoundLineBold from '@iconify-icons/solar/chat-round-line-bold'
import codeBold from '@iconify-icons/solar/code-bold'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import keyboardBold from '@iconify-icons/solar/keyboard-bold'
import logout3Bold from '@iconify-icons/solar/logout-3-bold'
import magicStick3Bold from '@iconify-icons/solar/magic-stick-3-bold'
import settingsBold from '@iconify-icons/solar/settings-bold'
import tuning2Bold from '@iconify-icons/solar/tuning-2-bold'
import userIdBold from '@iconify-icons/solar/user-id-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import widget6Bold from '@iconify-icons/solar/widget-6-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import type { IconifyIcon } from '@iconify/types'
import { Icon } from '@iconify/vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const {
  topbarPullCordEnabled,
  topbarCollapsed,
  setTopbarCollapsed,
  topbarPullCordPosition,
  setTopbarPullCordPosition,
} = useAdminShellPreferences()

type SiderMode = 'expanded' | 'compact' | 'hidden'

const SIDER_MODE_STORAGE_KEY = 'garlic-claw:admin-sider-mode'
const SIDER_WIDTH_STORAGE_KEY = 'garlic-claw:admin-sider-width'
const DEFAULT_VIEWPORT_WIDTH = 1280
const DEFAULT_EXPANDED_SIDER_WIDTH = 180
const MIN_EXPANDED_SIDER_WIDTH = 160
const MAX_EXPANDED_SIDER_WIDTH = 420
const COMPACT_SIDER_WIDTH = 64
const HIDDEN_SIDER_WIDTH = 0
const COLLAPSE_RATIO = 0.22
const EXPAND_RATIO = 0.2
const HANDLE_MIN_TOP = 80
const DEFAULT_BOTTOM_OFFSET = 12
const RESIZE_ACTIVATION_WIDTH = 1024
const TOPBAR_PULL_ANIMATION_MS = 180

type DragType = 'toggle-handle' | 'resize' | 'topbar-pull-cord' | null

function readSiderMode(): SiderMode {
  if (typeof window === 'undefined') {
    return 'compact'
  }

  const savedMode = window.localStorage.getItem(SIDER_MODE_STORAGE_KEY)
  if (savedMode === 'expanded' || savedMode === 'compact' || savedMode === 'hidden') {
    return savedMode
  }

  return 'compact'
}

function saveSiderMode(mode: SiderMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SIDER_MODE_STORAGE_KEY, mode)
}

function readExpandedSiderWidth() {
  if (typeof window === 'undefined') {
    return DEFAULT_EXPANDED_SIDER_WIDTH
  }

  const savedWidth = Number.parseInt(
    window.localStorage.getItem(SIDER_WIDTH_STORAGE_KEY) ?? '',
    10,
  )
  if (Number.isNaN(savedWidth)) {
    return DEFAULT_EXPANDED_SIDER_WIDTH
  }

  return Math.max(MIN_EXPANDED_SIDER_WIDTH, Math.min(MAX_EXPANDED_SIDER_WIDTH, savedWidth))
}

function saveExpandedSiderWidth(width: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SIDER_WIDTH_STORAGE_KEY, String(Math.round(width)))
}

function getEffectiveMaxExpandedWidth(viewportWidth: number) {
  if (viewportWidth <= 0) {
    return MAX_EXPANDED_SIDER_WIDTH
  }

  return Math.max(
    MIN_EXPANDED_SIDER_WIDTH,
    Math.min(MAX_EXPANDED_SIDER_WIDTH, Math.floor(viewportWidth * 0.4)),
  )
}

function clampExpandedSiderWidth(width: number, viewportWidth: number) {
  return Math.max(
    MIN_EXPANDED_SIDER_WIDTH,
    Math.min(getEffectiveMaxExpandedWidth(viewportWidth), width),
  )
}

const viewportWidth = ref(
  typeof window === 'undefined' ? DEFAULT_VIEWPORT_WIDTH : window.innerWidth,
)
const userPreferredSiderMode = ref<SiderMode>(readSiderMode())
const preferredExpandedSiderWidth = ref<number>(readExpandedSiderWidth())
const siderMode = ref<SiderMode>(userPreferredSiderMode.value)
const autoCompact = ref(false)
const handleBottom = ref(DEFAULT_BOTTOM_OFFSET)
const hiddenHandleDragging = ref(false)
const hiddenHandleMoved = ref(false)
const resizeDragging = ref(false)
const topbarPullAnimating = ref(false)
const topbarPullCordDragging = ref(false)
const topbarPullCordMoved = ref(false)
const topbarShellRef = ref<HTMLElement | null>(null)
const dragState = reactive({
  type: null as DragType,
  startX: 0,
  startY: 0,
  startWidth: 0,
  startBottom: 0,
  startPullCordPosition: 0,
})
let topbarPullTimer: ReturnType<typeof setTimeout> | null = null

const navItems: Array<{
  name:
    | 'chat'
    | 'plugins'
    | 'tools'
    | 'persona-settings'
    | 'mcp'
    | 'skills'
    | 'commands'
    | 'automations'
    | 'ai-settings'
    | 'console-settings'
  label: string
  icon: IconifyIcon
  divided?: boolean
}> = [
  { name: 'chat', label: '对话', icon: chatRoundLineBold },
  { name: 'persona-settings', label: '人设', icon: userIdBold },
  { name: 'skills', label: '技能', icon: magicStick3Bold },
  { name: 'commands', label: '命令', icon: keyboardBold },
  { name: 'tools', label: '工具', icon: tuning2Bold },
  { name: 'plugins', label: '插件', icon: widgetBold, divided: true },
  { name: 'mcp', label: 'MCP', icon: widgetAddBold },
  { name: 'automations', label: '自动化', icon: cpuBoltBold, divided: true },
  { name: 'ai-settings', label: 'AI 设置', icon: codeBold },
  { name: 'console-settings', label: '设置', icon: settingsBold },
]

const visibleNavItems = computed(() => navItems)

const isCompact = computed(() => siderMode.value === 'compact')
const isHidden = computed(() => siderMode.value === 'hidden')
const expandedSiderWidth = computed(() =>
  clampExpandedSiderWidth(preferredExpandedSiderWidth.value, viewportWidth.value),
)
const canResizeExpandedSider = computed(() =>
  !isHidden.value && !isCompact.value && viewportWidth.value >= RESIZE_ACTIVATION_WIDTH,
)
const currentSiderWidth = computed(() => {
  if (siderMode.value === 'hidden') {
    return HIDDEN_SIDER_WIDTH
  }
  if (siderMode.value === 'compact') {
    return COMPACT_SIDER_WIDTH
  }

  return expandedSiderWidth.value
})

const triggerText = computed(() => {
  if (isHidden.value) {
    return '展开侧栏'
  }
  if (isCompact.value) {
    return '继续收起'
  }

  return '收起侧栏'
})

const triggerIcon = computed(() => (isHidden.value ? altArrowRightBold : altArrowLeftBold))
const topbarPullLabel = computed(() => (topbarCollapsed.value ? '展开顶栏' : '收起顶栏'))

function toggleSider() {
  if (isHidden.value) {
    const nextMode: SiderMode = viewportWidth.value > 0
      && expandedSiderWidth.value / viewportWidth.value >= COLLAPSE_RATIO
      ? 'compact'
      : 'expanded'
    userPreferredSiderMode.value = nextMode
    siderMode.value = nextMode
    autoCompact.value = false
    saveSiderMode(nextMode)
    return
  }

  if (isCompact.value) {
    userPreferredSiderMode.value = 'hidden'
    siderMode.value = 'hidden'
    autoCompact.value = false
    saveSiderMode('hidden')
    return
  }

  userPreferredSiderMode.value = 'compact'
  siderMode.value = 'compact'
  autoCompact.value = false
  saveSiderMode('compact')
}

function applyAutoCollapse() {
  if (viewportWidth.value <= 0) {
    return
  }

  if (userPreferredSiderMode.value === 'hidden') {
    siderMode.value = 'hidden'
    autoCompact.value = false
    return
  }

  if (userPreferredSiderMode.value === 'compact') {
    siderMode.value = 'compact'
    autoCompact.value = false
    return
  }

  if (viewportWidth.value >= RESIZE_ACTIVATION_WIDTH) {
    siderMode.value = 'expanded'
    autoCompact.value = false
    return
  }

  const ratio = expandedSiderWidth.value / viewportWidth.value
  if (ratio >= COLLAPSE_RATIO) {
    siderMode.value = 'compact'
    autoCompact.value = true
    return
  }

  if (autoCompact.value && ratio <= EXPAND_RATIO) {
    siderMode.value = 'expanded'
    autoCompact.value = false
  }
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

function getMaxBottom() {
  return Math.max(DEFAULT_BOTTOM_OFFSET, window.innerHeight - HANDLE_MIN_TOP)
}

function getTouchClientY(event: TouchEvent | MouseEvent) {
  if ('touches' in event && event.touches.length > 0) {
    return event.touches[0].clientY
  }

  if ('clientY' in event) {
    return event.clientY
  }

  return dragState.startY
}

function onHandleStart(event: TouchEvent | MouseEvent) {
  hiddenHandleDragging.value = true
  hiddenHandleMoved.value = false
  dragState.type = 'toggle-handle'
  dragState.startY = getTouchClientY(event)
  dragState.startBottom = handleBottom.value
}

function onHandleMove(event: TouchEvent | MouseEvent) {
  if (dragState.type !== 'toggle-handle') {
    return
  }

  if ('touches' in event) {
    event.preventDefault()
  }

  const clientY = getTouchClientY(event)
  if (Math.abs(clientY - dragState.startY) > 3) {
    hiddenHandleMoved.value = true
  }

  const deltaY = dragState.startY - clientY
  const nextBottom = dragState.startBottom + deltaY
  handleBottom.value = Math.max(
    DEFAULT_BOTTOM_OFFSET,
    Math.min(getMaxBottom(), nextBottom),
  )
}

function getMouseClientX(event: MouseEvent) {
  return event.clientX
}

function getTopbarShellWidth() {
  const shellWidth = topbarShellRef.value?.clientWidth ?? 0
  return shellWidth > 0 ? shellWidth : window.innerWidth
}

function onResizeStart(event: MouseEvent) {
  if (!canResizeExpandedSider.value) {
    return
  }

  event.preventDefault()
  resizeDragging.value = true
  dragState.type = 'resize'
  dragState.startX = getMouseClientX(event)
  dragState.startWidth = expandedSiderWidth.value
}

function onResizeMove(event: MouseEvent) {
  if (dragState.type !== 'resize') {
    return
  }

  const deltaX = getMouseClientX(event) - dragState.startX
  preferredExpandedSiderWidth.value = clampExpandedSiderWidth(
    dragState.startWidth + deltaX,
    viewportWidth.value,
  )
}

function onTopbarPullCordStart(event: MouseEvent) {
  if (!topbarPullCordEnabled.value) {
    return
  }

  event.preventDefault()
  topbarPullCordDragging.value = true
  topbarPullCordMoved.value = false
  dragState.type = 'topbar-pull-cord'
  dragState.startX = getMouseClientX(event)
  dragState.startPullCordPosition = topbarPullCordPosition.value
}

function onTopbarPullCordMove(event: MouseEvent) {
  if (dragState.type !== 'topbar-pull-cord') {
    return
  }

  const shellWidth = getTopbarShellWidth()
  if (shellWidth <= 0) {
    return
  }

  const deltaX = getMouseClientX(event) - dragState.startX
  if (Math.abs(deltaX) > 3) {
    topbarPullCordMoved.value = true
  }

  setTopbarPullCordPosition(dragState.startPullCordPosition + deltaX / shellWidth)
}

function onHandleEnd() {
  const wasHandleDragging = dragState.type === 'toggle-handle'
  const wasTopbarDragging = dragState.type === 'topbar-pull-cord'
  dragState.type = null
  hiddenHandleDragging.value = false
  resizeDragging.value = false
  topbarPullCordDragging.value = false
  if (!wasHandleDragging) {
    if (!wasTopbarDragging) {
      return
    }
    window.setTimeout(() => {
      topbarPullCordMoved.value = false
    }, 50)
    return
  }

  window.setTimeout(() => {
    hiddenHandleMoved.value = false
  }, 50)
}

function onHandleClick() {
  if (hiddenHandleMoved.value) {
    return
  }

  toggleSider()
}

function clearTopbarPullTimer() {
  if (topbarPullTimer !== null) {
    window.clearTimeout(topbarPullTimer)
    topbarPullTimer = null
  }
}

function handleTopbarPullCordClick() {
  if (!topbarPullCordEnabled.value || topbarPullAnimating.value || topbarPullCordMoved.value) {
    return
  }

  clearTopbarPullTimer()
  topbarPullAnimating.value = true
  const nextCollapsed = !topbarCollapsed.value
  topbarPullTimer = window.setTimeout(() => {
    setTopbarCollapsed(nextCollapsed)
    topbarPullAnimating.value = false
    topbarPullTimer = null
  }, TOPBAR_PULL_ANIMATION_MS)
}

function handleLogout() {
  auth.logout()
  void router.push({ name: 'login' })
}

onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('resize', updateViewportWidth)
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mousemove', onHandleMove)
  window.addEventListener('mousemove', onTopbarPullCordMove)
  window.addEventListener('mouseup', onHandleEnd)
  window.addEventListener('touchmove', onHandleMove, { passive: false })
  window.addEventListener('touchend', onHandleEnd)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  clearTopbarPullTimer()
  window.removeEventListener('resize', updateViewportWidth)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mousemove', onHandleMove)
  window.removeEventListener('mousemove', onTopbarPullCordMove)
  window.removeEventListener('mouseup', onHandleEnd)
  window.removeEventListener('touchmove', onHandleMove)
  window.removeEventListener('touchend', onHandleEnd)
})

watch(viewportWidth, applyAutoCollapse, { immediate: true })
watch(preferredExpandedSiderWidth, (width) => {
  saveExpandedSiderWidth(width)
})
</script>

<template>
  <div
    class="admin-shell"
    :class="{
      'topbar-collapsible': topbarPullCordEnabled,
      'topbar-collapsed': topbarCollapsed,
      'topbar-pull-animating': topbarPullAnimating,
    }"
  >
    <div ref="topbarShellRef" class="admin-topbar-shell">
      <header class="admin-topbar">
        <div class="topbar-left">
          <span class="topbar-brand">🦞🧄 Garlic Claw</span>
        </div>
        <div class="topbar-right">
          <ThemeToggle />
          <button type="button" class="topbar-action-button" @click="handleLogout">
            <Icon class="topbar-action-icon" :icon="logout3Bold" aria-hidden="true" />
            退出登录
          </button>
        </div>
      </header>

      <button
        v-if="topbarPullCordEnabled"
        type="button"
        class="topbar-pull-cord"
        :class="{ 'is-dragging': topbarPullCordDragging }"
        :style="{ left: `${topbarPullCordPosition * 100}%` }"
        data-test="topbar-pull-cord"
        :aria-label="topbarPullLabel"
        @mousedown="onTopbarPullCordStart"
        @click="handleTopbarPullCordClick"
      >
        <span class="topbar-pull-cord-line" />
        <span class="topbar-pull-cord-handle" />
      </button>
    </div>

    <div class="admin-body">
      <aside
        class="admin-nav"
        :class="{
          'is-compact': isCompact,
          'is-hidden': isHidden,
          'is-resizing': resizeDragging,
          'has-resize-handle': canResizeExpandedSider,
        }"
        :style="{ width: `${currentSiderWidth}px` }"
      >
        <div class="sider-inner">
          <header class="sider-title">
            <Icon class="sider-title-icon" :icon="widget6Bold" />
            <span class="sider-title-text">控制台</span>
          </header>

          <nav class="sider-menu" aria-label="后台导航">
            <RouterLink
              v-for="item in visibleNavItems"
              :key="item.name"
              class="menu-item"
              :class="{
                active: route.name === item.name,
                'menu-item--divided': item.divided,
              }"
              :to="{ name: item.name }"
              :title="isCompact ? item.label : undefined"
            >
              <Icon class="menu-icon" :icon="item.icon" aria-hidden="true" />
              <span class="menu-label">{{ item.label }}</span>
            </RouterLink>
          </nav>

          <div
            class="sider-footer"
            :style="isHidden ? { bottom: `calc(${handleBottom}px + var(--app-safe-area-bottom, 0px))` } : undefined"
          >
            <button
              type="button"
              class="sider-trigger"
              :class="{ 'is-dragging': hiddenHandleDragging }"
              :aria-label="triggerText"
              @click="onHandleClick"
              @mousedown="onHandleStart"
              @touchstart="onHandleStart"
            >
              <Icon class="trigger-icon" :icon="triggerIcon" aria-hidden="true" />
              <span class="sider-trigger-text">{{ triggerText }}</span>
            </button>
          </div>
        </div>
      </aside>
      <div
        v-if="canResizeExpandedSider"
        class="admin-sider-resize-handle"
        data-test="admin-sider-resize-handle"
        role="separator"
        aria-label="调整侧栏宽度"
        aria-orientation="vertical"
        @mousedown="onResizeStart"
      />

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--shell-bg);
}

.admin-topbar-shell {
  position: relative;
  height: 48px;
  min-height: 0;
  flex-shrink: 0;
  transition: height 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.admin-shell.topbar-collapsed .admin-topbar-shell {
  height: 0;
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  min-height: 48px;
  padding: 0 16px;
  background: var(--shell-bg-elevated);
  border-bottom: 1px solid var(--shell-border);
  z-index: 100;
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease;
}

.admin-shell.topbar-collapsed .admin-topbar {
  opacity: 0;
  transform: translateY(-100%);
  pointer-events: none;
}

.topbar-brand {
  font-size: 14px;
  font-weight: 600;
  color: var(--shell-text);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-action-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid var(--shell-border-light);
  border-radius: 8px;
  padding: 0 12px;
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.topbar-action-button:hover {
  border-color: #64748b;
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
}

.topbar-action-icon {
  min-width: 16px;
  font-size: 16px;
  flex-shrink: 0;
}

.topbar-pull-cord {
  appearance: none;
  -webkit-appearance: none;
  position: absolute;
  top: 100%;
  z-index: 110;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 28px;
  min-height: 0;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: inherit;
  transform: translate(-50%, 0);
  cursor: pointer;
  box-shadow: none !important;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.topbar-pull-cord.is-dragging {
  cursor: grabbing;
}

.topbar-pull-cord:hover,
.topbar-pull-cord:focus,
.topbar-pull-cord:focus-visible,
.topbar-pull-cord:active {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  outline: none;
}

.admin-shell.topbar-collapsed .topbar-pull-cord {
  top: 0;
}

.topbar-pull-cord-line {
  width: 2px;
  height: 18px;
  background: linear-gradient(180deg, rgba(203, 213, 225, 0.92), rgba(120, 134, 156, 0.72));
  transition: height 0.18s ease;
}

.topbar-pull-cord-handle {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95), rgba(241, 245, 249, 0.9)),
    var(--shell-bg-elevated);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.topbar-pull-cord:hover .topbar-pull-cord-line {
  height: 20px;
}

.topbar-pull-cord:hover .topbar-pull-cord-handle {
  border-color: rgba(148, 163, 184, 0.6);
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.18);
}

.admin-shell.topbar-pull-animating .topbar-pull-cord-line {
  height: 26px;
}

.admin-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.admin-nav {
  align-self: stretch;
  position: relative;
  overflow: hidden;
  border-right: 1px solid var(--shell-border);
  background-color: var(--shell-bg-elevated);
  color: var(--shell-text);
  transition: width 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: width;
}

.admin-nav.is-resizing {
  transition: none;
}

.admin-nav.has-resize-handle {
  border-right: none;
}

.sider-inner {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 0;
}

.sider-title {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  padding: 8px 16px 16px 24px;
  color: var(--shell-text);
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.sider-title-icon {
  min-width: 18px;
  font-size: 18px;
}

.sider-title-text,
.sider-trigger-text {
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity 0.16s ease,
    transform 0.2s ease;
}

.sider-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px;
  scrollbar-width: none;
}

.sider-menu::-webkit-scrollbar {
  display: none;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin: 0;
  border-radius: 8px;
  padding: 0 20px;
  color: var(--shell-text-secondary);
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.menu-item:hover {
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
}

.menu-item.active {
  color: var(--shell-active);
  background-color: rgba(24, 160, 88, 0.1);
}

.menu-item--divided {
  margin-top: 14px;
}

.menu-item--divided::before {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: -8px;
  height: 1px;
  background-color: var(--shell-border);
  opacity: 0.9;
}

.menu-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  font-size: 20px;
  line-height: 1;
  text-align: center;
  opacity: 1;
  flex-shrink: 0;
}

.menu-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sider-footer {
  margin-top: auto;
  overflow: hidden;
  padding: 12px 8px calc(12px + var(--app-safe-area-bottom, 0px));
}

.sider-trigger {
  width: 100%;
  justify-content: flex-start;
  overflow: hidden;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--shell-text-secondary);
  white-space: nowrap;
  box-shadow: none;
  padding: 8px 0;
}

.sider-trigger:hover {
  background-color: var(--shell-bg-hover);
  color: var(--shell-text);
  border-color: transparent;
}

.sider-trigger:active {
  background-color: var(--shell-bg-hover);
}

.trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  min-width: 20px;
  font-size: 18px;
  line-height: 1;
  color: var(--shell-text);
  opacity: 1;
  flex-shrink: 0;
}

.sider-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 20px;
  white-space: nowrap;
}

.admin-content {
  flex: 1;
  height: 100%;
  overflow: auto;
  min-width: 0;
  background-color: var(--shell-bg);
}

.admin-sider-resize-handle {
  position: relative;
  width: 2px;
  flex: 0 0 1px;
  cursor: col-resize;
  background: rgba(148, 163, 184, 0.22);
  touch-action: none;
  transition: background-color 0.18s ease;
}

.admin-sider-resize-handle:hover,
.admin-nav.is-resizing + .admin-sider-resize-handle {
  background: rgba(59, 130, 246, 0.42);
}

.admin-nav.is-compact {
  min-width: 64px;
}

.admin-nav.is-compact .sider-title {
  padding-left: 24px;
}

.admin-nav.is-compact .sider-title {
  justify-content: center;
  padding: 8px 0 16px;
}

.admin-nav.is-compact .menu-item {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.admin-nav.is-compact .menu-icon {
  width: 24px;
  min-width: 24px;
  font-size: 20px;
}

.admin-nav.is-compact .sider-title-text,
.admin-nav.is-compact .sider-trigger-text,
.admin-nav.is-compact .menu-label {
  display: none;
}

.admin-nav.is-compact .menu-item--admin-start::before {
  left: 12px;
  right: 12px;
}

.admin-nav.is-compact .sider-trigger {
  justify-content: center;
  padding-left: 0;
  gap: 0;
}

.admin-nav.is-compact .trigger-icon {
  width: 24px;
  min-width: 24px;
}

.admin-nav.is-hidden {
  width: 0 !important;
  min-width: 0 !important;
  overflow: visible;
  border-right: none;
}

.admin-nav.is-hidden .sider-inner {
  overflow: visible;
  padding: 0;
}

.admin-nav.is-hidden .sider-title,
.admin-nav.is-hidden .sider-menu {
  opacity: 0;
  pointer-events: none;
}

.admin-nav.is-hidden .sider-footer {
  position: fixed;
  left: 0;
  z-index: 1000;
  overflow: visible;
  padding: 0;
}

.admin-nav.is-hidden .sider-trigger {
  position: relative;
  z-index: 10000;
  width: 60px;
  min-width: 60px;
  height: 36px;
  cursor: grab;
  border: 1px solid var(--shell-border-light);
  border-left: none;
  border-radius: 0 16px 16px 0;
  background-color: var(--shell-bg-elevated);
  box-shadow: 0 10px 28px rgba(2, 6, 23, 0.32);
  color: var(--shell-text);
  justify-content: center;
  padding: 0 0 0 10px;
}

.admin-nav.is-hidden .sider-trigger.is-dragging {
  cursor: grabbing;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
}

.admin-nav.is-hidden .sider-trigger::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 50%;
  width: 4px;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 999px;
  background-color: rgba(203, 213, 225, 0.22);
}

.admin-nav.is-hidden .sider-trigger-text {
  display: none;
}

.admin-nav.is-hidden .trigger-icon {
  font-size: 18px;
}

@media (max-width: 768px) {
  .topbar-pull-cord-line {
    height: 14px;
  }

  .menu-item {
    min-height: 48px;
  }
}
</style>
