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

