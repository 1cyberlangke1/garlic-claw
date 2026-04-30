import { readonly, ref } from 'vue'

const TOPBAR_PULL_CORD_ENABLED_STORAGE_KEY = 'garlic-claw:admin-topbar-pull-cord-enabled'
const TOPBAR_PULL_CORD_POSITION_STORAGE_KEY = 'garlic-claw:admin-topbar-pull-cord-position'
const DEFAULT_TOPBAR_PULL_CORD_POSITION = 0.9
const MIN_TOPBAR_PULL_CORD_POSITION = 0.12
const MAX_TOPBAR_PULL_CORD_POSITION = 0.95

function readTopbarPullCordEnabled() {
  if (typeof window === 'undefined') {
    return true
  }

  const saved = window.localStorage.getItem(TOPBAR_PULL_CORD_ENABLED_STORAGE_KEY)
  if (saved === null) {
    return true
  }

  return saved === 'true'
}

function saveTopbarPullCordEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(TOPBAR_PULL_CORD_ENABLED_STORAGE_KEY, String(enabled))
}

function clampTopbarPullCordPosition(position: number) {
  return Math.max(
    MIN_TOPBAR_PULL_CORD_POSITION,
    Math.min(MAX_TOPBAR_PULL_CORD_POSITION, position),
  )
}

function readTopbarPullCordPosition() {
  if (typeof window === 'undefined') {
    return DEFAULT_TOPBAR_PULL_CORD_POSITION
  }

  const saved = Number.parseFloat(
    window.localStorage.getItem(TOPBAR_PULL_CORD_POSITION_STORAGE_KEY) ?? '',
  )
  if (Number.isNaN(saved)) {
    return DEFAULT_TOPBAR_PULL_CORD_POSITION
  }

  return clampTopbarPullCordPosition(saved)
}

function saveTopbarPullCordPosition(position: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    TOPBAR_PULL_CORD_POSITION_STORAGE_KEY,
    String(clampTopbarPullCordPosition(position)),
  )
}

const topbarPullCordEnabledState = ref(readTopbarPullCordEnabled())
const topbarCollapsedState = ref(false)
const topbarPullCordPositionState = ref(readTopbarPullCordPosition())

export function useAdminShellPreferences() {
  function setTopbarPullCordEnabled(enabled: boolean) {
    topbarPullCordEnabledState.value = enabled
    saveTopbarPullCordEnabled(enabled)
    if (!enabled) {
      topbarCollapsedState.value = false
    }
  }

  function setTopbarCollapsed(collapsed: boolean) {
    topbarCollapsedState.value = topbarPullCordEnabledState.value ? collapsed : false
  }

  function toggleTopbarCollapsed() {
    setTopbarCollapsed(!topbarCollapsedState.value)
  }

  function setTopbarPullCordPosition(position: number) {
    const nextPosition = clampTopbarPullCordPosition(position)
    topbarPullCordPositionState.value = nextPosition
    saveTopbarPullCordPosition(nextPosition)
  }

  return {
    topbarPullCordEnabled: readonly(topbarPullCordEnabledState),
    topbarCollapsed: readonly(topbarCollapsedState),
    topbarPullCordPosition: readonly(topbarPullCordPositionState),
    setTopbarPullCordEnabled,
    setTopbarCollapsed,
    setTopbarPullCordPosition,
    toggleTopbarCollapsed,
  }
}
