import type {
  JsonObject,
  PluginConfigSchema,
  PluginManifest,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import {
  parsePluginScope,
  resolvePluginConfig,
} from './plugin-persistence.helpers';
import { parsePersistedPluginManifest } from './plugin-manifest.persistence';

export interface PersistedPluginGovernanceRecord {
  name: string;
  displayName: string | null;
  description: string | null;
  version: string | null;
  runtimeKind: string | null;
  manifestJson: string | null;
  config: string | null;
  defaultEnabled: boolean;
  conversationScopes: string | null;
}

export function readPersistedPluginManifestRecord(input: {
  plugin: PersistedPluginGovernanceRecord;
  onWarn?: (message: string) => void;
}): PluginManifest {
  return parsePersistedPluginManifest(
    input.plugin.manifestJson,
    {
      id: input.plugin.name,
      displayName: input.plugin.displayName,
      description: input.plugin.description,
      version: input.plugin.version,
      runtimeKind: input.plugin.runtimeKind,
    },
    (message) => {
      input.onWarn?.(`plugin.manifestJson JSON 无效，已回退默认值: ${message}`);
    },
  );
}

export function buildPluginGovernanceSnapshot(input: {
  plugin: PersistedPluginGovernanceRecord;
  onWarn?: (message: string) => void;
}): {
  configSchema: PluginConfigSchema | null;
  resolvedConfig: JsonObject;
  scope: PluginScopeSettings;
} {
  const manifest = readPersistedPluginManifestRecord(input);
  return {
    configSchema: manifest.config ?? null,
    resolvedConfig: resolvePluginConfig({
      rawConfig: input.plugin.config,
      manifest,
      onWarn: input.onWarn,
    }),
    scope: parsePluginScope({
      plugin: input.plugin,
      onWarn: input.onWarn,
    }),
  };
}
