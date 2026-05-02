import type { JsonObject, JsonValue } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';

const TOOL_MANAGEMENT_SECTION = 'tools';

interface ToolManagementConfigRecord {
  sourceEnabled?: Record<string, boolean>;
  toolEnabled?: Record<string, boolean>;
}

@Injectable()
export class ToolManagementSettingsService {
  private config: { sourceEnabled: Record<string, boolean>; toolEnabled: Record<string, boolean> };

  constructor(private readonly settingsService: SettingsService = new SettingsService()) {
    this.config = sanitizeToolManagementConfig(this.settingsService.readSection(TOOL_MANAGEMENT_SECTION));
  }

  readSourceEnabledOverride(key: string): boolean | undefined {
    return this.config.sourceEnabled[key];
  }

  writeSourceEnabledOverride(key: string, enabled: boolean): void {
    this.config.sourceEnabled[key] = enabled;
    this.persistConfig();
  }

  readToolEnabledOverride(key: string): boolean | undefined {
    return this.config.toolEnabled[key];
  }

  writeToolEnabledOverride(key: string, enabled: boolean): void {
    this.config.toolEnabled[key] = enabled;
    this.persistConfig();
  }

  private persistConfig(): void {
    this.settingsService.writeSection(TOOL_MANAGEMENT_SECTION, {
      sourceEnabled: { ...this.config.sourceEnabled },
      toolEnabled: { ...this.config.toolEnabled },
    });
  }
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
