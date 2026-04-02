import type {
  PluginManifest,
} from '@garlic-claw/shared';
import {
  readArray,
  readNonEmptyString,
  readRecord,
  readRuntimeKind,
} from './plugin-manifest-normalize-base.helpers';
import {
  readPermission,
  readPluginCapability,
  readPluginConfigSchema,
} from './plugin-manifest-normalize-capability.helpers';
import {
  readPluginCronDescriptor,
  readPluginHookDescriptor,
} from './plugin-manifest-normalize-lifecycle.helpers';
import {
  readPluginCommandDescriptor,
  readPluginRouteDescriptor,
} from './plugin-manifest-normalize-surface.helpers';

export interface PersistedPluginManifestFallback {
  id: string;
  displayName?: string | null;
  description?: string | null;
  version?: string | null;
  runtimeKind?: string | null;
}

export function normalizePluginManifestCandidate(
  candidate: unknown,
  fallback: PersistedPluginManifestFallback,
): PluginManifest {
  const source = readRecord(candidate);
  const manifest: PluginManifest = {
    id: readNonEmptyString(source?.id) ?? fallback.id,
    name: readNonEmptyString(source?.name)
      ?? readNonEmptyString(fallback.displayName)
      ?? fallback.id,
    version: readNonEmptyString(source?.version)
      ?? readNonEmptyString(fallback.version)
      ?? '0.0.0',
    runtime: readRuntimeKind(source?.runtime)
      ?? readRuntimeKind(fallback.runtimeKind)
      ?? 'remote',
    permissions: readArray(source?.permissions, readPermission),
    tools: readArray(source?.tools, readPluginCapability),
    hooks: readArray(source?.hooks, readPluginHookDescriptor),
    routes: readArray(source?.routes, readPluginRouteDescriptor),
  };

  const description = readNonEmptyString(source?.description)
    ?? readNonEmptyString(fallback.description);
  if (description) {
    manifest.description = description;
  }

  const commands = readArray(source?.commands, readPluginCommandDescriptor);
  if (commands.length > 0) {
    manifest.commands = commands;
  }

  const crons = readArray(source?.crons, readPluginCronDescriptor);
  if (crons.length > 0) {
    manifest.crons = crons;
  }

  const config = readPluginConfigSchema(source?.config);
  if (config) {
    manifest.config = config;
  }

  return manifest;
}
