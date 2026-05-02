import {
  CONTEXT_COMPACTION_CONFIG_SCHEMA,
  CONVERSATION_TITLE_CONFIG_SCHEMA,
  readContextCompactionConfig,
  readConversationTitleConfig,
  resolveContextCompactionRuntimeConfig,
  resolveConversationTitleRuntimeConfig,
} from '@garlic-claw/plugin-sdk/authoring';
import type { AiModelRouteTarget, JsonObject, JsonValue, PluginConfigSchema, PluginConfigSnapshot } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsStore } from '../core/config/settings.store';

const MAX_CONFIG_INTEGER = 1_000_000;
const CONTEXT_GOVERNANCE_SECTION = 'context';

const CONTEXT_GOVERNANCE_SECTION_NAMES = ['conversationTitle', 'contextCompaction'] as const;
type ContextGovernanceSectionName = typeof CONTEXT_GOVERNANCE_SECTION_NAMES[number];

export interface StoredContextGovernanceConfig {
  contextCompaction: ReturnType<typeof resolveContextCompactionRuntimeConfig> & { compressionModel?: AiModelRouteTarget };
  conversationTitle: ReturnType<typeof resolveConversationTitleRuntimeConfig> & { enabled: boolean };
}

const CONTEXT_GOVERNANCE_CONFIG_SCHEMA: PluginConfigSchema = { type: 'object', items: {
  conversationTitle: { type: 'object', description: '在默认标题会话完成首次回复后自动生成标题。', collapsed: true, items: { enabled: { type: 'bool', description: '是否启用自动标题生成', defaultValue: true }, ...CONVERSATION_TITLE_CONFIG_SCHEMA.items } },
  contextCompaction: { ...CONTEXT_COMPACTION_CONFIG_SCHEMA, description: '主对话上下文治理策略。', collapsed: true },
} };

@Injectable()
export class ContextGovernanceSettingsService {
  private configValues: JsonObject;

  constructor(private readonly settingsStore: SettingsStore = new SettingsStore()) {
    this.configValues = sanitizeContextGovernanceConfig(this.settingsStore.readSection(CONTEXT_GOVERNANCE_SECTION));
  }

  getConfigSnapshot(): PluginConfigSnapshot { return { schema: CONTEXT_GOVERNANCE_CONFIG_SCHEMA, values: structuredClone(this.configValues) }; }
  updateConfig(values: JsonObject): PluginConfigSnapshot { this.configValues = sanitizeContextGovernanceConfig(values); this.settingsStore.writeSection(CONTEXT_GOVERNANCE_SECTION, this.configValues); return this.getConfigSnapshot(); }
  readStoredConfig(): JsonObject { return structuredClone(this.configValues); }

  readRuntimeConfig(): StoredContextGovernanceConfig {
    const titleValues = readNestedObject(this.configValues, 'conversationTitle');
    const compactionValues = readNestedObject(this.configValues, 'contextCompaction');
    return {
      contextCompaction: {
        ...resolveContextCompactionRuntimeConfig(readContextCompactionConfig(compactionValues)),
        ...(readRouteTarget(compactionValues?.compressionModel) ? { compressionModel: readRouteTarget(compactionValues?.compressionModel) ?? undefined } : {}),
      },
      conversationTitle: {
        enabled: readEnabled(titleValues),
        ...resolveConversationTitleRuntimeConfig(readConversationTitleConfig(titleValues)),
      },
    };
  }
}

function sanitizeContextGovernanceConfig(values: JsonObject): JsonObject {
  const next: JsonObject = {};
  for (const sectionName of CONTEXT_GOVERNANCE_SECTION_NAMES) {
    const section = readNestedObject(values, sectionName);
    if (!section) {continue;}
    const sanitized = sanitizeContextGovernanceSection(sectionName, section);
    if (sanitized) {next[sectionName] = sanitized;}
  }
  return next;
}

function sanitizeContextGovernanceSection(sectionName: ContextGovernanceSectionName, values: JsonObject): JsonObject | null {
  const next: JsonObject = {};
  if (values.enabled !== undefined) {
    if (typeof values.enabled !== 'boolean') {throw new BadRequestException(`${sectionName}.enabled 必须是布尔值`);}
    next.enabled = values.enabled;
  }
  if (sectionName === 'conversationTitle') { writeOptionalText(next, values.defaultTitle, 'conversationTitle.defaultTitle'); writeOptionalInteger(next, values.maxMessages, 'conversationTitle.maxMessages', 1); }
  if (sectionName === 'contextCompaction') {
    writeOptionalTextOption(next, values.strategy, 'contextCompaction.strategy', ['sliding', 'summary']);
    for (const [key, value] of [['compressionThreshold', values.compressionThreshold], ['keepRecentMessages', values.keepRecentMessages], ['frontendMessageWindowSize', values.frontendMessageWindowSize], ['reservedTokens', values.reservedTokens], ['slidingWindowUsagePercent', values.slidingWindowUsagePercent]] as const) {writeOptionalInteger(next, value, `contextCompaction.${key}`, 1);}
    writeOptionalText(next, values.summaryPrompt, 'contextCompaction.summaryPrompt');
    writeOptionalBoolean(next, values.showCoveredMarker, 'contextCompaction.showCoveredMarker');
    writeOptionalBoolean(next, values.allowAutoContinue, 'contextCompaction.allowAutoContinue');
    writeOptionalRouteTarget(next, values.compressionModel, 'contextCompaction.compressionModel');
  }
  return Object.keys(next).length > 0 ? next : null;
}

function readNestedObject(value: JsonObject, key: ContextGovernanceSectionName): JsonObject | null { return isJsonObject(value[key]) ? value[key] : null; }
function readEnabled(section: JsonObject | null): boolean { return typeof section?.enabled === 'boolean' ? section.enabled : true; }
function readRouteTarget(value: unknown): AiModelRouteTarget | null {
  if (!isJsonObject(value) || typeof value.providerId !== 'string' || typeof value.modelId !== 'string') {
    return null;
  }
  const providerId = value.providerId.trim();
  const modelId = value.modelId.trim();
  return providerId && modelId ? { providerId, modelId } : null;
}

function writeOptionalInteger(target: JsonObject, value: unknown, fieldName: string, min: number): void {
  if (value === undefined) {return;}
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {throw new BadRequestException(`${fieldName} 必须是大于等于 ${min} 的整数`);}
  target[fieldName.split('.').at(-1) as string] = Math.min(value, MAX_CONFIG_INTEGER);
}

function writeOptionalBoolean(target: JsonObject, value: unknown, fieldName: string): void {
  if (value === undefined) {return;}
  if (typeof value !== 'boolean') {throw new BadRequestException(`${fieldName} 必须是布尔值`);}
  target[fieldName.split('.').at(-1) as string] = value;
}

function writeOptionalText(target: JsonObject, value: unknown, fieldName: string): void {
  if (value === undefined) {return;}
  if (typeof value !== 'string') {throw new BadRequestException(`${fieldName} 必须是字符串`);}
  const normalized = value.trim();
  if (normalized) {target[fieldName.split('.').at(-1) as string] = normalized;}
}

function writeOptionalTextOption<T extends string>(target: JsonObject, value: unknown, fieldName: string, options: readonly T[]): void {
  if (value === undefined) {return;}
  if (typeof value !== 'string' || !options.includes(value as T)) {throw new BadRequestException(`${fieldName} 必须命中声明的 options`);}
  target[fieldName.split('.').at(-1) as string] = value;
}

function writeOptionalRouteTarget(target: JsonObject, value: unknown, fieldName: string): void {
  if (value === undefined) {return;}
  const routeTarget = readRouteTarget(value);
  if (!routeTarget) {throw new BadRequestException(`${fieldName} 必须同时提供 providerId 和 modelId`);}
  target[fieldName.split('.').at(-1) as string] = {
    modelId: routeTarget.modelId,
    providerId: routeTarget.providerId,
  };
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
