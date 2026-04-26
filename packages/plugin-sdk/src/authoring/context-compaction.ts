import type { JsonValue, PluginManifest } from "@garlic-claw/shared";
import authoringConfigData from "./authoring-config-data.json";
import {
  pickOptionalNumberFields,
  pickOptionalStringFields,
  readJsonObjectValue,
  sanitizeOptionalText,
} from "./common-helpers";

export type PluginContextCompactionMode = "auto" | "manual";
export type PluginContextCompactionStrategy = "sliding" | "summary";

export interface PluginContextCompactionConfig {
  enabled?: boolean;
  mode?: PluginContextCompactionMode;
  strategy?: PluginContextCompactionStrategy;
  compressionThreshold?: number;
  keepRecentMessages?: number;
  frontendMessageWindowSize?: number;
  reservedTokens?: number;
  slidingWindowUsagePercent?: number;
  summaryPrompt?: string;
  showCoveredMarker?: boolean;
  allowAutoContinue?: boolean;
}

export const CONTEXT_COMPACTION_DEFAULT_MODE =
  authoringConfigData.defaults.contextCompactionMode as PluginContextCompactionMode;
export const CONTEXT_COMPACTION_DEFAULT_STRATEGY =
  authoringConfigData.defaults
    .contextCompactionStrategy as PluginContextCompactionStrategy;
export const CONTEXT_COMPACTION_DEFAULT_THRESHOLD =
  authoringConfigData.defaults.contextCompactionCompressionThreshold;
export const CONTEXT_COMPACTION_DEFAULT_KEEP_RECENT =
  authoringConfigData.defaults.contextCompactionKeepRecentMessages;
export const CONTEXT_COMPACTION_DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE =
  authoringConfigData.defaults.contextCompactionFrontendMessageWindowSize;
export const CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS =
  authoringConfigData.defaults.contextCompactionReservedTokens;
export const CONTEXT_COMPACTION_DEFAULT_SLIDING_WINDOW_USAGE_PERCENT =
  authoringConfigData.defaults.contextCompactionSlidingWindowUsagePercent;
export const CONTEXT_COMPACTION_DEFAULT_SUMMARY_PROMPT =
  authoringConfigData.defaults.contextCompactionSummaryPrompt;
export const CONTEXT_COMPACTION_DEFAULT_SHOW_COVERED_MARKER =
  authoringConfigData.defaults.contextCompactionShowCoveredMarker;
export const CONTEXT_COMPACTION_DEFAULT_ALLOW_AUTO_CONTINUE =
  authoringConfigData.defaults.contextCompactionAllowAutoContinue;
export const CONTEXT_COMPACTION_CONFIG_SCHEMA =
  authoringConfigData.contextCompactionConfigSchema as unknown as NonNullable<PluginManifest["config"]>;

export function readContextCompactionConfig(
  value: JsonValue,
): PluginContextCompactionConfig {
  const object = readJsonObjectValue(value);
  const mode =
    object?.mode === "auto" || object?.mode === "manual"
      ? object.mode
      : undefined;
  const strategy =
    object?.strategy === "summary" || object?.strategy === "sliding"
      ? object.strategy
      : undefined;
  return {
    ...(mode ? { mode } : {}),
    ...(strategy ? { strategy } : {}),
    ...pickOptionalStringFields(object, ["summaryPrompt"] as const),
    ...pickOptionalNumberFields(object, [
      "compressionThreshold",
      "keepRecentMessages",
      "frontendMessageWindowSize",
      "reservedTokens",
      "slidingWindowUsagePercent",
    ] as const),
    ...(typeof object?.enabled === "boolean" ? { enabled: object.enabled } : {}),
    ...(typeof object?.showCoveredMarker === "boolean"
      ? { showCoveredMarker: object.showCoveredMarker }
      : {}),
    ...(typeof object?.allowAutoContinue === "boolean"
      ? { allowAutoContinue: object.allowAutoContinue }
      : {}),
  };
}

export function resolveContextCompactionRuntimeConfig(
  config: PluginContextCompactionConfig,
): {
  enabled: boolean;
  mode: PluginContextCompactionMode;
  strategy: PluginContextCompactionStrategy;
  compressionThreshold: number;
  keepRecentMessages: number;
  frontendMessageWindowSize: number;
  reservedTokens: number;
  slidingWindowUsagePercent: number;
  summaryPrompt: string;
  showCoveredMarker: boolean;
  allowAutoContinue: boolean;
} {
  return {
    allowAutoContinue:
      typeof config.allowAutoContinue === "boolean"
        ? config.allowAutoContinue
        : CONTEXT_COMPACTION_DEFAULT_ALLOW_AUTO_CONTINUE,
    compressionThreshold: normalizeIntegerInRange(
      config.compressionThreshold,
      CONTEXT_COMPACTION_DEFAULT_THRESHOLD,
      1,
      100,
    ),
    enabled:
      typeof config.enabled === "boolean" ? config.enabled : true,
    keepRecentMessages: normalizeIntegerInRange(
      config.keepRecentMessages,
      CONTEXT_COMPACTION_DEFAULT_KEEP_RECENT,
      1,
      64,
    ),
    frontendMessageWindowSize: normalizeIntegerInRange(
      config.frontendMessageWindowSize,
      CONTEXT_COMPACTION_DEFAULT_FRONTEND_MESSAGE_WINDOW_SIZE,
      20,
      400,
    ),
    mode: config.mode === "manual" ? "manual" : CONTEXT_COMPACTION_DEFAULT_MODE,
    reservedTokens: normalizeIntegerInRange(
      config.reservedTokens,
      CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS,
      256,
      1_000_000,
    ),
    slidingWindowUsagePercent: normalizeIntegerInRange(
      config.slidingWindowUsagePercent,
      CONTEXT_COMPACTION_DEFAULT_SLIDING_WINDOW_USAGE_PERCENT,
      1,
      100,
    ),
    showCoveredMarker:
      typeof config.showCoveredMarker === "boolean"
        ? config.showCoveredMarker
        : CONTEXT_COMPACTION_DEFAULT_SHOW_COVERED_MARKER,
    strategy:
      config.strategy === "sliding" ? "sliding" : CONTEXT_COMPACTION_DEFAULT_STRATEGY,
    summaryPrompt:
      sanitizeOptionalText(config.summaryPrompt) ||
      CONTEXT_COMPACTION_DEFAULT_SUMMARY_PROMPT,
  };
}

function normalizeIntegerInRange(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
