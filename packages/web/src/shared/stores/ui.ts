import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

export type NotificationType = 'success' | 'error'

export interface ConfirmDialogState {
  visible: boolean
  message: string
  confirming: boolean
}

type ConfirmHandler = () => void | Promise<void>

export const useUiStore = defineStore('ui', () => {
  const confirmDialog = ref<ConfirmDialogState>({
    visible: false,
    message: '',
    confirming: false,
  })

  const loadingCount = ref(0)
  const loading = computed(() => loadingCount.value > 0)
  let currentConfirmHandler: ConfirmHandler | null = null

  /**
   * 推送全局提示消息，统一委托给 Element Plus Message。
   */
  function notify(message: string, type: NotificationType = 'success') {
    ElMessage({
      message,
      type,
      duration: type === 'error' ? 5000 : 3200,
      showClose: true,
      grouping: true,
    })
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
    confirmDialog,
    loading,
    notify,
    confirm,
    runConfirm,
    cancelConfirm,
    beginLoading,
    endLoading,
    withLoading,
  }
})
