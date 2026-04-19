import type { JsonValue, PluginManifest } from "@garlic-claw/shared";
import builtinManifestData from "./builtin-manifest-data.json";
import {
  pickOptionalNumberFields,
  pickOptionalStringFields,
  readJsonObjectValue,
  sanitizeOptionalText,
} from "./common-helpers";

export type PluginContextCompactionMode = "auto" | "manual";

export interface PluginContextCompactionConfig {
  enabled?: boolean;
  mode?: PluginContextCompactionMode;
  compressionThreshold?: number;
  keepRecentMessages?: number;
  reservedTokens?: number;
  summaryPrompt?: string;
  showCoveredMarker?: boolean;
  allowAutoContinue?: boolean;
}

export const CONTEXT_COMPACTION_DEFAULT_MODE =
  builtinManifestData.defaults.contextCompactionMode as PluginContextCompactionMode;
export const CONTEXT_COMPACTION_DEFAULT_THRESHOLD =
  builtinManifestData.defaults.contextCompactionCompressionThreshold;
export const CONTEXT_COMPACTION_DEFAULT_KEEP_RECENT =
  builtinManifestData.defaults.contextCompactionKeepRecentMessages;
export const CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS =
  builtinManifestData.defaults.contextCompactionReservedTokens;
export const CONTEXT_COMPACTION_DEFAULT_SUMMARY_PROMPT =
  builtinManifestData.defaults.contextCompactionSummaryPrompt;
export const CONTEXT_COMPACTION_DEFAULT_SHOW_COVERED_MARKER =
  builtinManifestData.defaults.contextCompactionShowCoveredMarker;
export const CONTEXT_COMPACTION_DEFAULT_ALLOW_AUTO_CONTINUE =
  builtinManifestData.defaults.contextCompactionAllowAutoContinue;
export const CONTEXT_COMPACTION_CONFIG_SCHEMA =
  builtinManifestData.contextCompactionConfigSchema as unknown as NonNullable<PluginManifest["config"]>;
export const CONTEXT_COMPACTION_MANIFEST =
  builtinManifestData.contextCompactionManifest as unknown as PluginManifest;

export function readContextCompactionConfig(
  value: JsonValue,
): PluginContextCompactionConfig {
  const object = readJsonObjectValue(value);
  const mode =
    object?.mode === "auto" || object?.mode === "manual"
      ? object.mode
      : undefined;
  return {
    ...(mode ? { mode } : {}),
    ...pickOptionalStringFields(object, ["summaryPrompt"] as const),
    ...pickOptionalNumberFields(object, [
      "compressionThreshold",
      "keepRecentMessages",
      "reservedTokens",
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
  compressionThreshold: number;
  keepRecentMessages: number;
  reservedTokens: number;
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
    mode: config.mode === "manual" ? "manual" : CONTEXT_COMPACTION_DEFAULT_MODE,
    reservedTokens: normalizeIntegerInRange(
      config.reservedTokens,
      CONTEXT_COMPACTION_DEFAULT_RESERVED_TOKENS,
      256,
      1_000_000,
    ),
    showCoveredMarker:
      typeof config.showCoveredMarker === "boolean"
        ? config.showCoveredMarker
        : CONTEXT_COMPACTION_DEFAULT_SHOW_COVERED_MARKER,
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
