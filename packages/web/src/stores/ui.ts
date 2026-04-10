import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type NotificationType = 'success' | 'error'

export interface UiNotification {
  id: string
  message: string
  type: NotificationType
  createdAt: number
}

export interface ConfirmDialogState {
  visible: boolean
  message: string
  confirming: boolean
}

type ConfirmHandler = () => void | Promise<void>

export const useUiStore = defineStore('ui', () => {
  const notifications = ref<UiNotification[]>([])
  const confirmDialog = ref<ConfirmDialogState>({
    visible: false,
    message: '',
    confirming: false,
  })

  const loadingCount = ref(0)
  const loading = computed(() => loadingCount.value > 0)
  let currentConfirmHandler: ConfirmHandler | null = null

  /**
   * 推送全局提示消息。
   */
  function notify(message: string, type: NotificationType = 'success') {
    notifications.value.push({
      id: createNotificationId(),
      message,
      type,
      createdAt: Date.now(),
    })
  }

  function removeNotification(notificationId: string) {
    notifications.value = notifications.value.filter(
      (notification) => notification.id !== notificationId,
    )
  }

  function clearNotifications() {
    notifications.value = []
  }

  /**
   * 打开全局确认弹窗，确认后执行回调。
   */
  function confirm(message: string, onConfirm: ConfirmHandler) {
    confirmDialog.value = {
      visible: true,
      message,
      confirming: false,
    }
    currentConfirmHandler = onConfirm
  }

  async function runConfirm() {
    if (!confirmDialog.value.visible || !currentConfirmHandler) {
      closeConfirmDialog()
      return
    }

    if (confirmDialog.value.confirming) {
      return
    }

    confirmDialog.value = {
      ...confirmDialog.value,
      confirming: true,
    }

    try {
      await currentConfirmHandler()
    } finally {
      closeConfirmDialog()
    }
  }

  function cancelConfirm() {
    closeConfirmDialog()
  }

  function beginLoading() {
    loadingCount.value += 1
  }

  function endLoading() {
    loadingCount.value = Math.max(0, loadingCount.value - 1)
  }

  async function withLoading<T>(task: () => Promise<T>): Promise<T> {
    beginLoading()
    try {
      return await task()
    } finally {
      endLoading()
    }
  }

  function closeConfirmDialog() {
    confirmDialog.value = {
      visible: false,
      message: '',
      confirming: false,
    }
    currentConfirmHandler = null
  }

  return {
    notifications,
    confirmDialog,
    loading,
    notify,
    confirm,
    runConfirm,
    cancelConfirm,
    removeNotification,
    clearNotifications,
    beginLoading,
    endLoading,
    withLoading,
  }
})

function createNotificationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
