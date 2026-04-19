import type { EventLogListResult, EventLogQuery, SkillDetail, UpdateSkillGovernancePayload } from '@garlic-claw/shared'
import {
  listSkillEvents,
  listSkills,
  refreshSkills,
  updateSkillGovernance,
} from '@/features/skills/api/skills'
import { getErrorMessage } from '@/utils/error'

/**
 * 读取 skill 列表。
 * @returns 当前技能目录
 */
export function loadSkillCatalog(): Promise<SkillDetail[]> {
  return listSkills()
}

/**
 * 刷新 skill 目录。
 * @returns 刷新后的技能列表
 */
export function refreshSkillCatalog(): Promise<SkillDetail[]> {
  return refreshSkills()
}

/**
 * 保存 skill 治理配置。
 * @param skillId skill ID
 * @param patch 局部治理配置
 * @returns 更新后的 skill
 */
export function saveSkillGovernance(
  skillId: string,
  patch: UpdateSkillGovernancePayload,
): Promise<SkillDetail> {
  return updateSkillGovernance(skillId, patch)
}

export function loadSkillEvents(
  skillId: string,
  query: EventLogQuery,
): Promise<EventLogListResult> {
  return listSkillEvents(skillId, normalizeEventLogQuery(query))
}

export function normalizeEventLogQuery(query: EventLogQuery): EventLogQuery {
  return {
    limit: Math.min(200, Math.max(1, query.limit ?? 50)),
    ...(query.level ? { level: query.level } : {}),
    ...(query.type?.trim() ? { type: query.type.trim() } : {}),
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
  }
}

export function dedupeEventLogs(events: EventLogListResult['items']) {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false
    }
    seen.add(event.id)
    return true
  })
}

/**
 * 统一转换 skill 管理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
