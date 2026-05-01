export const INTERNAL_CONFIG_CHANGED_EVENT = 'garlic-claw:internal-config-changed'

export interface InternalConfigChangedDetail {
  scope: 'context-governance' | 'provider-models' | 'runtime-tools' | 'subagent' | 'vision-fallback'
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

export function subscribeInternalConfigChanged(
  listener: (detail: InternalConfigChangedDetail) => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function' ||
    typeof window.removeEventListener !== 'function'
  ) {
    return () => {}
  }

  const wrapped = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return
    }
    listener(event.detail as InternalConfigChangedDetail)
  }

  window.addEventListener(INTERNAL_CONFIG_CHANGED_EVENT, wrapped)
  return () => {
    window.removeEventListener(INTERNAL_CONFIG_CHANGED_EVENT, wrapped)
  }
}
