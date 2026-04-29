import type { PluginHealthSnapshot, PluginHealthStatus } from '@garlic-claw/shared'

export function healthLabel(health: PluginHealthSnapshot | null | undefined): string {
  switch (health?.status) {
    case 'healthy': return '健康'
    case 'degraded': return '降级'
    case 'error': return '异常'
    case 'offline': return '离线'
    default: return '未知'
  }
}

export function formatPluginTime(value: string | null | undefined): string {
  if (!value) return '未检查'
  return new Date(value).toLocaleString()
}

export function pluginHealthStatus(health: PluginHealthSnapshot | null | undefined): PluginHealthStatus {
  return health?.status ?? 'unknown'
}
