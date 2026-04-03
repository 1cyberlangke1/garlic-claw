import type {
  PluginManifest,
} from '@garlic-claw/shared';
import {
  normalizePluginManifestCandidate,
  type PersistedPluginManifestFallback,
} from './plugin-manifest-normalize.helpers';
export {
  normalizePluginManifestCandidate,
  type PersistedPluginManifestFallback,
} from './plugin-manifest-normalize.helpers';

type ManifestParseErrorHandler = (message: string) => void;

export function serializePersistedPluginManifest(manifest: PluginManifest): string {
  return JSON.stringify(
    normalizePluginManifestCandidate(manifest, {
      id: manifest.id,
      displayName: manifest.name,
      description: manifest.description,
      version: manifest.version,
      runtimeKind: manifest.runtime,
    }),
  );
}

export function parsePersistedPluginManifest(
  raw: string | null,
  fallback: PersistedPluginManifestFallback,
  onError?: ManifestParseErrorHandler,
): PluginManifest {
  if (!raw) {
    return normalizePluginManifestCandidate(null, fallback);
  }

  try {
    return normalizePluginManifestCandidate(JSON.parse(raw) as unknown, fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onError?.(message);
    return normalizePluginManifestCandidate(null, fallback);
  }
}
