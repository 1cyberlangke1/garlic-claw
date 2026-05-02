<script setup lang="ts">
import { useThemeStore } from '@/shared/stores/theme'
import moonBold from '@iconify-icons/solar/moon-bold'
import sunBold from '@iconify-icons/solar/sun-bold'
import { Icon } from '@iconify/vue'
import { ElButton } from 'element-plus'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ThemePanel from './ThemePanel.vue'

const theme = useThemeStore()

const wrapperRef = ref<HTMLElement>()
const panelOpen = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

function toggleTheme() {
  if (theme.followSystem) {
    theme.setFollowSystem(false)
    theme.isDark ? theme.setLightMode() : theme.setDarkMode()
  } else {
    theme.isDark ? theme.setLightMode() : theme.setDarkMode()
  }
}

function openPanel() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
}

function scheduleClose() {
  closeTimer = setTimeout(() => {
    panelOpen.value = false
  }, 150)
}

function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}

function handleClickOutside(e: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    closePanel()
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside, true))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside, true))
</script>

<template>
  <div
    ref="wrapperRef"
    class="theme-toggle-wrapper"
    @mouseenter="openPanel"
    @mouseleave="scheduleClose"
  >
    <ElButton
      class="theme-trigger"
      :title="theme.isDark && !theme.followSystem ? '深色模式' : '浅色模式'"
      @click="toggleTheme"
    >
      <Icon :icon="theme.isDark ? moonBold : sunBold" />
    </ElButton>

    <Transition name="theme-dropdown">
      <div
        v-if="panelOpen"
        class="theme-panel"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
      >
        <ThemePanel @select="closePanel()" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.theme-toggle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.theme-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 20px;
  padding: 0;
  transition: color 0.15s, background 0.15s;
}

.theme-trigger:hover {
  color: var(--text);
  background: var(--bg-glass-light);
}

.theme-panel {
  position: absolute;
  top: calc(100% + 20px);
  right: 0;
  z-index: 1100;
  min-width: 180px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-glass);
  box-shadow: var(--shadow);
  backdrop-filter: blur(var(--glass-blur));
}

/* panel transition */
.theme-dropdown-enter-active,
.theme-dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.theme-dropdown-enter-from,
.theme-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
