export const PLUGIN_CONFIG_CHANGED_EVENT = 'garlic-claw:plugin-config-changed'

export interface PluginConfigChangedDetail {
  changeType: 'config' | 'scope'
  pluginName: string
}

export function emitPluginConfigChanged(detail: PluginConfigChangedDetail) {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<PluginConfigChangedDetail>(PLUGIN_CONFIG_CHANGED_EVENT, {
      detail,
    }),
  )
}

export function subscribePluginConfigChanged(
  listener: (detail: PluginConfigChangedDetail) => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PluginConfigChangedDetail>).detail
    if (!detail) {
      return
    }
    listener(detail)
  }

  window.addEventListener(PLUGIN_CONFIG_CHANGED_EVENT, handler)
  return () => {
    window.removeEventListener(PLUGIN_CONFIG_CHANGED_EVENT, handler)
  }
}
