import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { addRequestErrorListener } from '@/api/http'
import { useUiStore } from '@/stores/ui'

import App from './App.vue'
import router from './router'
import './style.css'

const pinia = createPinia()
const uiStore = useUiStore(pinia)

if (typeof window !== 'undefined') {
  const silenceRequestErrors = () => {
    ;(window as Window & {
      __GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__?: boolean
    }).__GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__ = true
  }
  window.addEventListener('pagehide', silenceRequestErrors, { capture: true })
  window.addEventListener('beforeunload', silenceRequestErrors, { capture: true })
}

addRequestErrorListener(({ error, method, url }) => {
  if (shouldSilenceRequestErrorLogs()) {
    return
  }

  uiStore.notify(error.message || '请求失败，请稍后重试', 'error')

  if (!import.meta.env.DEV) {
    return
  }

  console.error('[app] api request error', {
    method,
    url,
    status: error.status ?? null,
    code: error.code ?? null,
    message: error.message,
  })
})

function shouldSilenceRequestErrorLogs() {
  if (typeof window === 'undefined') {
    return false
  }

  return (window as Window & {
    __GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__?: boolean
  }).__GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__ === true
}

const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')
