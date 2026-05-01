import type {
  EventLogListResult,
  EventLogQuery,
  SkillDetail,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared'
import { get, post, put } from '@/shared/api/http'

export function listSkills() {
  return get<SkillDetail[]>('/skills')
}

export function refreshSkills() {
  return post<SkillDetail[]>('/skills/refresh')
}

export function updateSkillGovernance(
  skillId: string,
  payload: UpdateSkillGovernancePayload,
) {
  return put<SkillDetail>(`/skills/${encodeURIComponent(skillId)}/governance`, payload)
}

export function listSkillEvents(
  skillId: string,
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
  return get<EventLogListResult>(`/skills/${encodeURIComponent(skillId)}/events${querySuffix}`)
}
