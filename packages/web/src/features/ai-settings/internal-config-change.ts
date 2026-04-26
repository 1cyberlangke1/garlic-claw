export const INTERNAL_CONFIG_CHANGED_EVENT = 'garlic-claw:internal-config-changed'

export interface InternalConfigChangedDetail {
  scope: 'context-governance' | 'runtime-tools' | 'subagent'
}

export function emitInternalConfigChanged(detail: InternalConfigChangedDetail) {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(
    new CustomEvent<InternalConfigChangedDetail>(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail,
    }),
  )
}
