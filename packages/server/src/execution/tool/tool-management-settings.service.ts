import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, JsonValue } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';
import { createServerTestArtifactPath } from '../../runtime/server-workspace-paths';

const TOOL_MANAGEMENT_CONFIG_FILE = 'settings.json';

interface ToolManagementConfigRecord {
  sourceEnabled?: Record<string, boolean>;
  toolEnabled?: Record<string, boolean>;
}

@Injectable()
export class ToolManagementSettingsService {
  private readonly configPath = resolveToolManagementConfigPath();
  private config = loadToolManagementConfig(this.configPath);

  readSourceEnabledOverride(key: string): boolean | undefined {
    return this.config.sourceEnabled[key];
  }

  writeSourceEnabledOverride(key: string, enabled: boolean): void {
    this.config.sourceEnabled[key] = enabled;
    persistToolManagementConfig(this.configPath, this.config);
  }

  readToolEnabledOverride(key: string): boolean | undefined {
    return this.config.toolEnabled[key];
  }

  writeToolEnabledOverride(key: string, enabled: boolean): void {
    this.config.toolEnabled[key] = enabled;
    persistToolManagementConfig(this.configPath, this.config);
  }
}

function resolveToolManagementConfigPath(): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_TOOL_MANAGEMENT_CONFIG_PATH
      ?? createServerTestArtifactPath({ extension: '.json', prefix: 'config-tool-management.server.test', subdirectory: 'server' });
  }
  return process.env.GARLIC_CLAW_TOOL_MANAGEMENT_CONFIG_PATH
    ?? path.join(new ProjectWorktreeRootService().resolveRoot(process.cwd()), 'config', 'tools', TOOL_MANAGEMENT_CONFIG_FILE);
}

function loadToolManagementConfig(configPath: string): { sourceEnabled: Record<string, boolean>; toolEnabled: Record<string, boolean> } {
  try {
    if (!fs.existsSync(configPath)) {
      return { sourceEnabled: {}, toolEnabled: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as JsonValue;
    return sanitizeToolManagementConfig(isJsonObject(parsed) ? parsed : {});
  } catch {
    return { sourceEnabled: {}, toolEnabled: {} };
  }
}

function persistToolManagementConfig(
  configPath: string,
  config: { sourceEnabled: Record<string, boolean>; toolEnabled: Record<string, boolean> },
): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function sanitizeToolManagementConfig(values: JsonObject): { sourceEnabled: Record<string, boolean>; toolEnabled: Record<string, boolean> } {
  const record = values as ToolManagementConfigRecord;
  return {
    sourceEnabled: sanitizeBooleanMap(record.sourceEnabled),
    toolEnabled: sanitizeBooleanMap(record.toolEnabled),
  };
}

function sanitizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!isJsonObject(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => typeof entry === 'boolean' ? [[key, entry]] : []),
  );
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
