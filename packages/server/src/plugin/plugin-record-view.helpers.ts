import type {
  JsonObject,
  PluginConfigSnapshot,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import {
  readPersistedPluginManifestRecord,
  type PersistedPluginGovernanceRecord,
} from './plugin-governance.helpers';
import { resolvePluginConfig } from './plugin-persistence.helpers';

export function buildPluginConfigSnapshot(input: {
  plugin: PersistedPluginGovernanceRecord;
  onWarn?: (message: string) => void;
}): PluginConfigSnapshot {
  const manifest = readPersistedPluginManifestRecord(input);
  return {
    schema: manifest.config ?? null,
    values: resolvePluginConfig({
      rawConfig: input.plugin.config,
      manifest,
      onWarn: input.onWarn,
    }),
  };
}

export function buildResolvedPluginConfig(input: {
  plugin: PersistedPluginGovernanceRecord;
  onWarn?: (message: string) => void;
}): JsonObject {
  const manifest = readPersistedPluginManifestRecord(input);
  return resolvePluginConfig({
    rawConfig: input.plugin.config,
    manifest,
    onWarn: input.onWarn,
  });
}

export function buildPluginSelfInfo(input: {
  plugin: PersistedPluginGovernanceRecord;
  onWarn?: (message: string) => void;
}): PluginSelfInfo {
  const manifest = readPersistedPluginManifestRecord(input);
  return {
    id: input.plugin.name,
    name: manifest.name,
    runtimeKind: input.plugin.runtimeKind === 'builtin' ? 'builtin' : 'remote',
    version: manifest.version || undefined,
    description: manifest.description ?? undefined,
    permissions: [...manifest.permissions],
    ...(manifest.crons ? { crons: [...manifest.crons] } : {}),
    ...(manifest.commands ? { commands: [...manifest.commands] } : {}),
    hooks: [...(manifest.hooks ?? [])],
    routes: [...(manifest.routes ?? [])],
  };
}
