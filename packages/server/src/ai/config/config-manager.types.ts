import type {
  AiModelRouteTarget,
  AiProviderMode,
  AiUtilityModelRolesConfig,
  VisionFallbackConfig,
} from '@garlic-claw/shared';

/**
 * 持久化的 provider 配置。
 */
export interface StoredAiProviderConfig {
  id: string;
  name: string;
  mode: AiProviderMode;
  driver: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models: string[];
}

/**
 * 持久化的视觉转述配置。
 */
export interface StoredVisionFallbackConfig extends VisionFallbackConfig {}

/**
 * 持久化的模型路由目标。
 */
export interface StoredAiModelRouteTarget extends AiModelRouteTarget {}

/**
 * 持久化的宿主 AI 模型路由配置。
 */
export interface StoredAiHostModelRoutingConfig {
  fallbackChatModels: StoredAiModelRouteTarget[];
  compressionModel?: StoredAiModelRouteTarget;
  utilityModelRoles: AiUtilityModelRolesConfig;
}

/**
 * AI 设置文件结构。
 */
export interface AiSettingsFile {
  /** 配置版本。 */
  version: number;
  /** 最近更新时间。 */
  updatedAt: string;
  /** provider 配置列表。 */
  providers: StoredAiProviderConfig[];
  /** 视觉转述配置。 */
  visionFallback: StoredVisionFallbackConfig;
  /** 宿主模型路由配置。 */
  hostModelRouting: StoredAiHostModelRoutingConfig;
}
