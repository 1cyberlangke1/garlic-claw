import type { JsonObject, JsonValue, PluginCallContext, PluginLlmMessage } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import { createInvalidToolResult, stringifyInvalidToolInput } from '../../execution/invalid/invalid-tool-record';
import { sanitizeModelToolCallName } from '../../execution/tool/model-tool-call-name';

export const DEFAULT_PERSONA_ID = 'builtin.default-assistant';
export const DEFAULT_PROVIDER_ID = 'builtin.default';
export const DEFAULT_PROVIDER_MODEL_ID = 'builtin.default.general';
export const SCOPED_STORE_PREFIX = '__gc_scope__:';
const KNOWN_ASSISTANT_DELTA_KEYS = new Set(['audio', 'content', 'function_call', 'refusal', 'role', 'tool_calls']);
const PLUGIN_LLM_MESSAGE_ROLES = new Set(['assistant', 'system', 'tool', 'user']);

export type RuntimeHostScope = 'conversation' | 'plugin' | 'user';
export type AssistantCustomBlockEntry = { key: string; kind: 'json'; value: JsonValue } | { key: string; kind: 'text'; value: string };

export function cloneJsonValue<T>(value: T): T { return structuredClone(value); }
export function asJsonObject<T extends object>(value: T): JsonObject { return cloneJsonValue(value) as unknown as JsonObject; }
export function asJsonValue<T>(value: T): JsonValue { return cloneJsonValue(value) as unknown as JsonValue; }
export function readJsonObject(value: unknown): JsonObject | null { return isJsonObject(value) ? cloneJsonValue(value) : null; }
export function readJsonValue(value: unknown): JsonValue | null { return isJsonValue(value) ? cloneJsonValue(value) : null; }

export function readKeywords(value: unknown): string[] {
  return typeof value === 'string' ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

export function readJsonStringRecord(value: unknown, invalidMessage: string): Record<string, string> | null {
  const record = readJsonObject(value);
  if (!record) { return null; }
  if (Object.values(record).some((entry) => typeof entry !== 'string')) { throw new BadRequestException(invalidMessage); }
  return record as Record<string, string>;
}

export function readPluginLlmMessages(value: unknown, emptyMessage: string, createError: (message: string) => Error = (message) => new BadRequestException(message), label = 'plugin'): PluginLlmMessage[] {
  if (!Array.isArray(value) || value.length === 0) { throw createError(emptyMessage); }
  return value.flatMap((message, index) => {
    if (message === null || message === undefined) { return []; }
    const record = readJsonObject(message);
    if (!record) { throw createError(`${label}: messages[${index}] must be an object`); }
    if (!PLUGIN_LLM_MESSAGE_ROLES.has(String(record.role))) { throw createError(`${label}: messages[${index}].role is invalid`); }
    if (typeof record.content !== 'string' && !Array.isArray(record.content)) { throw createError(`${label}: messages[${index}].content is invalid`); }
    return [cloneJsonValue({ content: record.content, role: record.role }) as PluginLlmMessage];
  });
}

export function readAssistantStreamPart(rawPart: unknown): { type: 'text-delta'; text: string } | { type: 'tool-call'; input: JsonValue; toolCallId: string; toolName: string } | { type: 'tool-result'; output: JsonValue; toolCallId: string; toolName: string } | null {
  if (!isRecord(rawPart) || typeof rawPart.type !== 'string') { return null; }
  if (rawPart.type === 'text-delta' && typeof rawPart.text === 'string') { return { text: rawPart.text, type: 'text-delta' }; }
  if ((rawPart.type === 'tool-call' || rawPart.type === 'tool-result') && typeof rawPart.toolCallId === 'string' && typeof rawPart.toolName === 'string') {
    const toolName = sanitizeModelToolCallName(rawPart.toolName);
    return rawPart.type === 'tool-call' ? { input: rawPart.input as JsonValue, toolCallId: rawPart.toolCallId, toolName, type: 'tool-call' } : { output: rawPart.output as JsonValue, toolCallId: rawPart.toolCallId, toolName, type: 'tool-result' };
  }
  if (rawPart.type === 'tool-error' && typeof rawPart.toolCallId === 'string' && typeof rawPart.toolName === 'string') {
    const inputText = stringifyInvalidToolInput(rawPart.input);
    const toolName = sanitizeModelToolCallName(rawPart.toolName);
    return {
      output: createInvalidToolResult({ error: readToolErrorMessage(rawPart.error), ...(inputText ? { inputText } : {}), phase: 'execute', tool: toolName }) as unknown as JsonValue,
      toolCallId: rawPart.toolCallId,
      toolName,
      type: 'tool-result',
    };
  }
  return null;
}

export function readAssistantRawCustomBlocks(rawPart: unknown): AssistantCustomBlockEntry[] {
  return readAssistantCustomBlocks(isRecord(rawPart) && rawPart.type === 'raw' ? rawPart.rawValue : null, 'delta');
}

export function readAssistantResponseCustomBlocks(responseBody: unknown): AssistantCustomBlockEntry[] {
  return readAssistantCustomBlocks(responseBody, 'message');
}

export function readMessageTarget(value: unknown): { id: string; type: 'conversation' } | null {
  if (!isRecord(value)) { return null; }
  if (value.type !== 'conversation') { throw new BadRequestException('message.send target.type currently only supports conversation'); }
  if (typeof value.id !== 'string' || value.id.trim().length === 0) { throw new BadRequestException('message.send target.id is required'); }
  return { id: value.id.trim(), type: 'conversation' };
}

export function readOptionalBoolean(params: JsonObject, key: string): boolean | null {
  const value = params[key];
  if (value === undefined) { return null; }
  if (typeof value !== 'boolean') { throw new BadRequestException(`${key} must be boolean`); }
  return value;
}

export function readOptionalString(params: JsonObject, key: string): string | null {
  const value = params[key], trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

export function readPositiveInteger(params: JsonObject, key: string): number | null {
  const value = params[key];
  if (value === undefined) { return null; }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) { throw new BadRequestException(`${key} must be a positive integer`); }
  return value;
}

export function readRequiredJsonValue(params: JsonObject, key: string): JsonValue {
  const value = readJsonValue(params[key]);
  if (value === null) { throw new BadRequestException(`${key} must be valid JSON data`); }
  return value;
}

export function readRequiredString(params: JsonObject, key: string): string {
  const value = readOptionalString(params, key);
  if (value) { return value; }
  throw new BadRequestException(`${key} is required`);
}

export function readScope(params: JsonObject): RuntimeHostScope {
  const scope = readOptionalString(params, 'scope') ?? 'plugin';
  if (scope === 'conversation' || scope === 'plugin' || scope === 'user') { return scope; }
  throw new BadRequestException('scope must be plugin, conversation or user');
}

export function readScopedKey(params: JsonObject): string {
  const key = readRequiredString(params, 'key');
  if (key.startsWith(SCOPED_STORE_PREFIX)) { throw new BadRequestException(`key cannot start with reserved prefix ${SCOPED_STORE_PREFIX}`); }
  return key;
}

export function requireContextField(context: PluginCallContext, field: 'conversationId' | 'userId'): string {
  const value = context[field];
  if (value) { return value; }
  throw new BadRequestException(`Host API requires ${field} in call context`);
}

function isJsonArray(value: unknown): value is JsonValue[] { return Array.isArray(value) && value.every((entry) => isJsonValue(entry)); }
function isJsonObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((entry) => isJsonValue(entry)); }
function isJsonValue(value: unknown): value is JsonValue { return value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || isJsonArray(value) || isJsonObject(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function readAssistantCustomBlocks(value: unknown, field: 'delta' | 'message'): AssistantCustomBlockEntry[] {
  const choice = isRecord(value) && Array.isArray(value.choices) ? value.choices[0] : null, container = isRecord(choice) && isRecord(choice[field]) ? choice[field] : null;
  return container ? Object.entries(container).flatMap(([key, entry]) => readAssistantCustomBlockEntry(key, entry)) : [];
}

function readAssistantCustomBlockEntry(key: string, value: unknown): AssistantCustomBlockEntry[] {
  if (KNOWN_ASSISTANT_DELTA_KEYS.has(key)) { return []; }
  if (typeof value === 'string') { return value.length > 0 ? [{ key, kind: 'text', value }] : []; }
  return isJsonValue(value) ? [{ key, kind: 'json', value }] : [];
}

function readToolErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : typeof value === 'string' && value.trim().length > 0 ? value.trim() : '工具执行失败';
}
