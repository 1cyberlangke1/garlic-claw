import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonObject, JsonValue } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { ProjectWorktreeRootService } from '../../execution/project/project-worktree-root.service';
import { createServerTestArtifactPath } from '../../runtime/server-workspace-paths';

const SETTINGS_CONFIG_FILE = 'settings.json';

@Injectable()
export class SettingsStore {
  private readonly settingsPath: string;

  constructor(
    private readonly projectWorktreeRootService: ProjectWorktreeRootService = new ProjectWorktreeRootService(),
  ) {
    this.settingsPath = resolveSettingsConfigPath(this.projectWorktreeRootService);
  }

  readSection(sectionName: string): JsonObject {
    const settings = loadSettings(this.settingsPath);
    return isJsonObject(settings[sectionName]) ? structuredClone(settings[sectionName]) : {};
  }

  writeSection(sectionName: string, values: JsonObject): void {
    const settings = loadSettings(this.settingsPath);
    if (Object.keys(values).length === 0) {
      delete settings[sectionName];
    } else {
      settings[sectionName] = structuredClone(values);
    }
    persistSettings(this.settingsPath, settings);
  }
}

function resolveSettingsConfigPath(projectWorktreeRootService: ProjectWorktreeRootService): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH
      ?? createServerTestArtifactPath({ extension: '.json', prefix: 'config-settings.server.test', subdirectory: 'server' });
  }
  return process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH
    ?? path.join(projectWorktreeRootService.resolveRoot(process.cwd()), 'config', SETTINGS_CONFIG_FILE);
}

function loadSettings(settingsPath: string): JsonObject {
  try {
    ensureSettingsSeeded(settingsPath);
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as JsonValue;
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function ensureSettingsSeeded(settingsPath: string): void {
  if (fs.existsSync(settingsPath)) {
    return;
  }
  const examplePath = resolveSettingsExamplePath(settingsPath);
  if (!fs.existsSync(examplePath)) {
    return;
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.copyFileSync(examplePath, settingsPath);
}

function resolveSettingsExamplePath(settingsPath: string): string {
  const parsed = path.parse(settingsPath);
  return path.join(parsed.dir, `${parsed.name.replace(/\.example$/u, '')}.example${parsed.ext}`);
}

function persistSettings(settingsPath: string, settings: JsonObject): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function isJsonObject(value: JsonValue | unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
