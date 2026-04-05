import type {
  AiModelCapabilities,
  ConversationHostServices,
  ConversationSkillState,
  UpdateConversationHostServicesPayload,
} from '@garlic-claw/shared'
import {
  getVisionFallbackConfig,
  listAiModels,
} from '@/features/ai-settings/api/ai'
import {
  getConversationHostServices,
  updateConversationHostServices,
} from '@/features/chat/api/chat'
import {
  getConversationSkills,
  updateConversationSkills,
} from '@/features/skills/api/skills'

const DEFAULT_HOST_SERVICES: ConversationHostServices = {
  sessionEnabled: true,
  llmEnabled: true,
  ttsEnabled: true,
}

const EMPTY_CONVERSATION_SKILL_STATE: ConversationSkillState = {
  activeSkillIds: [],
  activeSkills: [],
}

/**
 * 读取当前选中模型的能力。
 * @param providerId provider ID
 * @param modelId 模型 ID
 * @returns 模型能力；找不到时返回 null
 */
export async function loadModelCapabilities(
  providerId: string,
  modelId: string,
): Promise<AiModelCapabilities | null> {
  const models = await listAiModels(providerId)
  const model = models.find((item) => item.id === modelId)
  return model?.capabilities ?? null
}

/**
 * 读取当前是否启用了 Vision Fallback。
 * @returns 当前是否启用
 */
export async function loadVisionFallbackEnabled(): Promise<boolean> {
  try {
    const config = await getVisionFallbackConfig()
    return Boolean(config.enabled && config.providerId && config.modelId)
  } catch {
    return false
  }
}

/**
 * 读取当前会话的宿主服务开关。
 * @param conversationId 会话 ID
 * @returns 当前会话的宿主服务开关
 */
export async function loadConversationHostServices(
  conversationId: string,
): Promise<ConversationHostServices> {
  try {
    return await getConversationHostServices(conversationId)
  } catch {
    return DEFAULT_HOST_SERVICES
  }
}

/**
 * 保存当前会话的宿主服务开关。
 * @param conversationId 会话 ID
 * @param patch 待保存的局部状态
 * @returns 保存后的完整宿主服务状态
 */
export function saveConversationHostServices(
  conversationId: string,
  patch: UpdateConversationHostServicesPayload,
): Promise<ConversationHostServices> {
  return updateConversationHostServices(conversationId, patch)
}

/**
 * 读取当前会话激活的 skill 列表。
 * @param conversationId 会话 ID
 * @returns 会话级 skill 状态
 */
export async function loadConversationSkillState(
  conversationId: string,
): Promise<ConversationSkillState> {
  try {
    return await getConversationSkills(conversationId)
  } catch {
    return EMPTY_CONVERSATION_SKILL_STATE
  }
}

/**
 * 保存当前会话激活的 skill 列表。
 * @param conversationId 会话 ID
 * @param activeSkillIds 激活中的 skill ID 列表
 * @returns 保存后的会话 skill 状态
 */
export function saveConversationSkills(
  conversationId: string,
  activeSkillIds: string[],
): Promise<ConversationSkillState> {
  return updateConversationSkills(conversationId, {
    activeSkillIds,
  })
}
