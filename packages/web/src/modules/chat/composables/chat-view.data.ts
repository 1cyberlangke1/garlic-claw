import type { AiModelCapabilities } from '@garlic-claw/shared'
import {
  getVisionFallbackConfig,
  listAiModels,
} from '@/modules/ai-settings/api/ai'

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

