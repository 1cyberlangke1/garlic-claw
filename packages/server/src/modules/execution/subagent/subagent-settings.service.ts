import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, JsonValue, PluginConfigSnapshot } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SUBAGENT_CONFIG_SCHEMA, type PluginSubagentConfig } from '@garlic-claw/plugin-sdk/authoring';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';
import { createServerTestArtifactPath } from '../../../core/runtime/server-workspace-paths';

const SUBAGENT_CONFIG_FILE = 'settings.json';
export const INTERNAL_SUBAGENT_SOURCE_ID = 'subagent';
const MAX_CONFIG_INTEGER = 1_000_000;

@Injectable()
export class SubagentSettingsService {
  private readonly configPath = resolveSubagentConfigPath();
  private configValues: JsonObject = loadSubagentConfig(this.configPath);

  getSourceId(): string {
    return INTERNAL_SUBAGENT_SOURCE_ID;
  }

  getConfigSnapshot(): PluginConfigSnapshot {
    return {
      schema: SUBAGENT_CONFIG_SCHEMA,
      values: structuredClone(this.configValues),
    };
  }

  getStoredConfig(): JsonObject {
    return structuredClone(this.configValues);
  }

  updateConfig(values: JsonObject): PluginConfigSnapshot {
    this.configValues = sanitizeSubagentConfig(values);
    persistSubagentConfig(this.configPath, this.configValues);
    return this.getConfigSnapshot();
  }

  readSubagentConfig(): PluginSubagentConfig {
    return readStoredSubagentConfig(this.configValues);
  }
}

function resolveSubagentConfigPath(): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_SUBAGENT_CONFIG_PATH
      ?? createServerTestArtifactPath({ extension: '.json', prefix: 'config-subagent.server.test', subdirectory: 'server' });
  }
  return process.env.GARLIC_CLAW_SUBAGENT_CONFIG_PATH
    ?? path.join(new ProjectWorktreeRootService().resolveRoot(process.cwd()), 'config', 'subagent', SUBAGENT_CONFIG_FILE);
}

function loadSubagentConfig(configPath: string): JsonObject {
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonValue;
    return sanitizeSubagentConfig(isJsonObject(parsed) ? parsed : {});
  } catch {
    return {};
  }
}

function persistSubagentConfig(configPath: string, values: JsonObject): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(values, null, 2), 'utf-8');
}

function sanitizeSubagentConfig(values: JsonObject): JsonObject {
  const next: JsonObject = {};
  const llm = isJsonObject(values.llm) ? sanitizeSubagentLlmConfig(values.llm) : null;
  const session = isJsonObject(values.session) ? sanitizeSubagentSessionConfig(values.session) : null;
  const tools = isJsonObject(values.tools) ? sanitizeSubagentToolConfig(values.tools) : null;
  if (llm) {
    next.llm = llm;
  }
  if (session) {
    next.session = session;
  }
  if (tools) {
    next.tools = tools;
  }
  return next;
}

function sanitizeSubagentLlmConfig(values: JsonObject): JsonObject | null {
  const next: JsonObject = {};
  writeOptionalText(next, 'targetSubagentType', values.targetSubagentType);
  writeOptionalText(next, 'targetProviderId', values.targetProviderId);
  writeOptionalText(next, 'targetModelId', values.targetModelId);
  return Object.keys(next).length > 0 ? next : null;
}

function sanitizeSubagentSessionConfig(values: JsonObject): JsonObject | null {
  const next: JsonObject = {};
  if (values.maxConversationSubagents !== undefined) {
    next.maxConversationSubagents = readPositiveInteger(
      values.maxConversationSubagents,
      'subagent.session.maxConversationSubagents',
    );
  }
  return Object.keys(next).length > 0 ? next : null;
}

function sanitizeSubagentToolConfig(values: JsonObject): JsonObject | null {
  const allowedToolNames = Array.isArray(values.allowedToolNames)
    ? values.allowedToolNames
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
    : [];
  return allowedToolNames.length > 0
    ? { allowedToolNames }
    : null;
}

function readStoredSubagentConfig(config: JsonObject): PluginSubagentConfig {
  const llm = isJsonObject(config.llm) ? config.llm : null;
  const session = isJsonObject(config.session) ? config.session : null;
  const tools = isJsonObject(config.tools) ? config.tools : null;
  const allowedToolNames = Array.isArray(tools?.allowedToolNames)
    ? tools.allowedToolNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  return {
    ...(typeof llm?.targetSubagentType === 'string' ? { targetSubagentType: llm.targetSubagentType } : {}),
    ...(typeof llm?.targetProviderId === 'string' ? { targetProviderId: llm.targetProviderId } : {}),
    ...(typeof llm?.targetModelId === 'string' ? { targetModelId: llm.targetModelId } : {}),
    ...(typeof session?.maxConversationSubagents === 'number' ? { maxConversationSubagents: session.maxConversationSubagents } : {}),
    ...(allowedToolNames.length > 0 ? { allowedToolNames } : {}),
  };
}

function writeOptionalText(target: JsonObject, key: string, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const normalized = value.trim();
  if (normalized) {
    target[key] = normalized;
  }
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new BadRequestException(`${fieldName} 必须是大于 0 的整数`);
  }
  return Math.min(value, MAX_CONFIG_INTEGER);
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
