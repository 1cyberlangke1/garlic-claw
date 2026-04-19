import { delete as del, get, post, put } from '@/api/http'
import type {
  EventLogListResult,
  EventLogQuery,
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared'

export function listMcpServers() {
  return get<McpConfigSnapshot>('/mcp/servers')
}

export function createMcpServer(input: McpServerConfig) {
  return post<McpServerConfig>('/mcp/servers', input)
}

export function updateMcpServer(currentName: string, input: McpServerConfig) {
  return put<McpServerConfig>(`/mcp/servers/${encodeURIComponent(currentName)}`, input)
}

export function deleteMcpServer(name: string) {
  return del<McpServerDeleteResult>(`/mcp/servers/${encodeURIComponent(name)}`)
}

export function listMcpServerEvents(
  name: string,
  query: EventLogQuery = {},
) {
  const search = new URLSearchParams()
  if (query.limit !== undefined) {
    search.set('limit', String(query.limit))
  }
  if (query.level) {
    search.set('level', query.level)
  }
  if (query.type?.trim()) {
    search.set('type', query.type.trim())
  }
  if (query.keyword?.trim()) {
    search.set('keyword', query.keyword.trim())
  }
  if (query.cursor?.trim()) {
    search.set('cursor', query.cursor.trim())
  }

  const querySuffix = search.size > 0 ? `?${search.toString()}` : ''
  return get<EventLogListResult>(
    `/mcp/servers/${encodeURIComponent(name)}/events${querySuffix}`,
  )
}
