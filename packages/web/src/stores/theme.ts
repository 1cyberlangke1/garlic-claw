import { defineStore } from 'pinia'
import { ref } from 'vue'

type ThemeValue = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'garlic-claw:theme'

function readStoredTheme(): ThemeValue {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'dark'
}

function writeStoredTheme(value: ThemeValue) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, value)
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const useThemeStore = defineStore('theme', () => {
  const followSystem = ref(false)
  const isDark = ref(true)

  let systemMediaQuery: MediaQueryList | null = null

  function applyTheme() {
    const dark = followSystem.value ? getSystemDark() : isDark.value
    if (dark) {
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
    }
  }

  function persist() {
    if (followSystem.value) {
      writeStoredTheme('system')
    } else {
      writeStoredTheme(isDark.value ? 'dark' : 'light')
    }
  }

  function handleSystemChange(e: MediaQueryListEvent) {
    if (!followSystem.value) return
    applyTheme()
  }

  function listenToSystemTheme() {
    if (typeof window === 'undefined') return
    systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    systemMediaQuery.addEventListener('change', handleSystemChange)
  }

  function setLightMode() {
    isDark.value = false
    followSystem.value = false
    persist()
    applyTheme()
  }

  function setDarkMode() {
    isDark.value = true
    followSystem.value = false
    persist()
    applyTheme()
  }

  function setFollowSystem(value: boolean) {
    followSystem.value = value
    persist()
    applyTheme()
  }

  function initTheme() {
    const stored = readStoredTheme()
    if (stored === 'system') {
      followSystem.value = true
      isDark.value = getSystemDark()
    } else {
      followSystem.value = false
      isDark.value = stored === 'dark'
    }
    applyTheme()
    listenToSystemTheme()
  }

  return {
    isDark,
    followSystem,
    initTheme,
    setLightMode,
    setDarkMode,
    setFollowSystem,
  }
})
