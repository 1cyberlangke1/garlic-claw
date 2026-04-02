import type {
  JsonObject,
  JsonValue,
  PluginConfigSchema,
  PluginManifest,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import { normalizePluginScopeForGovernance } from './plugin-governance-policy';

interface PersistedPluginScopeRecord {
  name: string;
  runtimeKind?: string | null;
  defaultEnabled: boolean;
  conversationScopes: string | null;
}

interface PluginJsonParseInput {
  raw: string | null;
  label: string;
  onWarn?: (message: string) => void;
}

export function resolvePluginConfig(input: {
  rawConfig: string | null;
  manifest: PluginManifest;
  onWarn?: (message: string) => void;
}): JsonObject {
  const schema = input.manifest.config ?? null;
  const stored = parsePluginJsonObject({
    raw: input.rawConfig,
    label: 'plugin.jsonObject',
    onWarn: input.onWarn,
  });
  if (!schema) {
    return stored;
  }

  const resolved: JsonObject = {};
  for (const field of schema.fields) {
    const storedValue = stored[field.key];
    if (storedValue !== undefined) {
      resolved[field.key] = storedValue;
      continue;
    }
    if (field.defaultValue !== undefined) {
      resolved[field.key] = field.defaultValue;
    }
  }

  return resolved;
}

export function validateAndNormalizePluginConfig(
  schema: PluginConfigSchema,
  values: JsonObject,
): JsonObject {
  const normalized: JsonObject = {};
  const fieldsByKey = new Map(schema.fields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(values)) {
    const field = fieldsByKey.get(key);
    if (!field) {
      throw new BadRequestException(`未知的插件配置项: ${key}`);
    }
    if (!matchesPluginConfigType(field.type, value)) {
      throw new BadRequestException(`插件配置 ${key} 类型无效`);
    }
    normalized[key] = value;
  }

  for (const field of schema.fields) {
    const provided = normalized[field.key];
    if (field.required && provided === undefined && field.defaultValue === undefined) {
      throw new BadRequestException(`插件配置 ${field.key} 必填`);
    }
  }

  return normalized;
}

export function validatePluginScope(scope: PluginScopeSettings): void {
  if (typeof scope.defaultEnabled !== 'boolean') {
    throw new BadRequestException('defaultEnabled 必须是布尔值');
  }

  for (const [conversationId, enabled] of Object.entries(scope.conversations)) {
    if (!conversationId) {
      throw new BadRequestException('conversationId 不能为空');
    }
    if (typeof enabled !== 'boolean') {
      throw new BadRequestException(
        `conversation ${conversationId} 的启停值必须是布尔值`,
      );
    }
  }
}

export function parsePluginScope(input: {
  plugin: PersistedPluginScopeRecord;
  onWarn?: (message: string) => void;
}): PluginScopeSettings {
  const conversations = parsePluginBooleanRecord({
    raw: input.plugin.conversationScopes,
    label: 'plugin.jsonObject',
    onWarn: input.onWarn,
  });

  return normalizePluginScopeForGovernance({
    pluginId: input.plugin.name,
    runtimeKind: input.plugin.runtimeKind,
    scope: {
      defaultEnabled: input.plugin.defaultEnabled,
      conversations,
    },
  });
}

export function parseStoredPluginJsonValue(input: {
  raw: string | null;
  fallback: JsonValue | null;
  label: string;
  onWarn?: (message: string) => void;
}): JsonValue | null {
  if (!input.raw) {
    return input.fallback;
  }

  const parsed = safeParsePluginJson(input);
  return isPluginJsonValue(parsed) ? parsed : input.fallback;
}

export function parsePluginJsonObject(input: PluginJsonParseInput): JsonObject {
  if (!input.raw) {
    return {};
  }

  const parsed = safeParsePluginJson(input);
  return isPluginJsonObject(parsed) ? parsed : {};
}

export function parseNullablePluginJsonObject(
  input: PluginJsonParseInput,
): JsonObject | null {
  if (!input.raw) {
    return null;
  }

  const parsed = safeParsePluginJson(input);
  return isPluginJsonObject(parsed) ? parsed : null;
}

function parsePluginBooleanRecord(
  input: PluginJsonParseInput,
): Record<string, boolean> {
  const parsed = parsePluginJsonObject(input);
  const result: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') {
      result[key] = value;
    }
  }

  return result;
}

function matchesPluginConfigType(
  type: PluginConfigSchema['fields'][number]['type'],
  value: JsonValue,
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return false;
  }
}

function safeParsePluginJson(input: PluginJsonParseInput): unknown {
  try {
    return JSON.parse(input.raw ?? '') as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.onWarn?.(`${input.label} JSON 无效，已回退默认值: ${message}`);
    return undefined;
  }
}

function isPluginJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isPluginJsonValue(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => isPluginJsonValue(entry));
}

function isPluginJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isPluginJsonValue(entry));
}
