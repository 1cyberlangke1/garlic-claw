import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiHostModelRoutingConfig, AiProviderMode } from '@garlic-claw/shared';
import { ProjectWorktreeRootService } from '../execution/project/project-worktree-root.service';
import type { AiProviderStorageFile, AiSettingsFile, StoredAiModelConfig, StoredAiProviderConfig } from './ai-management.types';

const AI_PROVIDER_DIRECTORY = 'providers';
const AI_HOST_MODEL_ROUTING_FILE = 'host-model-routing.json';
const AI_VISION_FALLBACK_FILE = 'vision-fallback.json';

export function resolveAiSettingsPath(): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_AI_SETTINGS_PATH
      ?? path.join(process.cwd(), 'tmp', `config-ai.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
  return process.env.GARLIC_CLAW_AI_SETTINGS_PATH
    ?? path.join(new ProjectWorktreeRootService().resolveRoot(process.cwd()), 'config', 'ai');
}

export function loadAiSettings(settingsPath: string): AiSettingsFile {
  const empty = createEmptySettings();
  try {
    fs.mkdirSync(readAiProviderDirectory(settingsPath), { recursive: true });
    const providerFiles = readAiProviderStorageFiles(settingsPath);
    return {
      hostModelRouting: readJsonFile(path.join(settingsPath, AI_HOST_MODEL_ROUTING_FILE), cloneRoutingConfig(empty.hostModelRouting)),
      models: providerFiles.flatMap((provider) => provider.persistedModels?.map(cloneStoredAiModelConfig) ?? []).sort(compareStoredModels),
      providers: providerFiles.map(({ persistedModels: _persistedModels, ...provider }) => cloneStoredProviderConfig(provider)).sort((left, right) => left.id.localeCompare(right.id)),
      visionFallback: readJsonFile(path.join(settingsPath, AI_VISION_FALLBACK_FILE), { ...empty.visionFallback }),
    };
  } catch {
    return empty;
  }
}

export function saveAiSettings(settingsPath: string, settings: AiSettingsFile): void {
  const providerDirectory = readAiProviderDirectory(settingsPath), activeProviderIds = new Set(settings.providers.map((provider) => provider.id));
  fs.mkdirSync(providerDirectory, { recursive: true });
  for (const entry of fs.readdirSync(providerDirectory, { withFileTypes: true })) {
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') {
      const providerId = decodeURIComponent(path.basename(entry.name, '.json'));
      if (!activeProviderIds.has(providerId)) { fs.rmSync(path.join(providerDirectory, entry.name), { force: true }); }
    }
  }
  const persistedModels = settings.models.reduce<Map<string, StoredAiModelConfig[]>>((map, model) => {
    const current = map.get(model.providerId) ?? [];
    current.push(cloneStoredAiModelConfig(model));
    map.set(model.providerId, current);
    return map;
  }, new Map());
  for (const provider of settings.providers) {
    fs.writeFileSync(
      path.join(providerDirectory, `${encodeURIComponent(provider.id)}.json`),
      JSON.stringify({
        ...cloneStoredProviderConfig(provider),
        persistedModels: (persistedModels.get(provider.id) ?? []).map(cloneStoredAiModelConfig),
      } satisfies AiProviderStorageFile, null, 2),
      'utf-8',
    );
  }
  fs.writeFileSync(path.join(settingsPath, AI_HOST_MODEL_ROUTING_FILE), JSON.stringify(cloneRoutingConfig(settings.hostModelRouting), null, 2), 'utf-8');
  fs.writeFileSync(path.join(settingsPath, AI_VISION_FALLBACK_FILE), JSON.stringify({ ...settings.visionFallback }, null, 2), 'utf-8');
}

export function cloneRoutingConfig(config: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  return {
    fallbackChatModels: config.fallbackChatModels.map((entry) => ({ ...entry })),
    ...(config.compressionModel ? { compressionModel: { ...config.compressionModel } } : {}),
    utilityModelRoles: Object.fromEntries(Object.entries(config.utilityModelRoles).map(([role, target]) => [role, target ? { ...target } : target])) as AiHostModelRoutingConfig['utilityModelRoles'],
  };
}

function readAiProviderDirectory(settingsPath: string): string {
  return path.join(settingsPath, AI_PROVIDER_DIRECTORY);
}

function readAiProviderStorageFiles(settingsPath: string): AiProviderStorageFile[] {
  return fs.readdirSync(readAiProviderDirectory(settingsPath), { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .map((entry) => readAiProviderStorageFile(path.join(readAiProviderDirectory(settingsPath), entry.name)))
    .filter((entry): entry is AiProviderStorageFile => entry !== null);
}

function readAiProviderStorageFile(filePath: string): AiProviderStorageFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<AiProviderStorageFile>;
    const providerId = normalizeOptionalText(parsed.id) ?? decodeURIComponent(path.basename(filePath, '.json'));
    const name = normalizeOptionalText(parsed.name) ?? providerId;
    const mode = typeof parsed.mode === 'string' ? parsed.mode as AiProviderMode : null;
    const driver = normalizeOptionalText(parsed.driver);
    if (!providerId || !name || !mode || !driver) { return null; }
    return {
      apiKey: normalizeOptionalText(parsed.apiKey),
      baseUrl: normalizeOptionalText(parsed.baseUrl),
      defaultModel: normalizeOptionalText(parsed.defaultModel),
      driver,
      id: providerId,
      mode,
      models: Array.isArray(parsed.models)
        ? [...new Set(parsed.models.flatMap((entry) => {
          const value = normalizeOptionalText(entry);
          return value ? [value] : [];
        }))]
        : [],
      name,
      persistedModels: Array.isArray(parsed.persistedModels) ? parsed.persistedModels.flatMap(normalizeStoredAiModelConfig) : [],
    };
  } catch {
    return null;
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T : fallback;
  } catch {
    return fallback;
  }
}

function cloneStoredProviderConfig(provider: StoredAiProviderConfig): StoredAiProviderConfig {
  return { ...provider, models: [...provider.models] };
}

function cloneStoredAiModelConfig(model: StoredAiModelConfig): StoredAiModelConfig {
  return {
    ...model,
    capabilities: {
      ...model.capabilities,
      input: { ...model.capabilities.input },
      output: { ...model.capabilities.output },
    },
  };
}

function normalizeStoredAiModelConfig(input: unknown): StoredAiModelConfig[] {
  if (typeof input !== 'object' || input === null) { return []; }
  const record = input as Partial<StoredAiModelConfig>, id = normalizeOptionalText(record.id), providerId = normalizeOptionalText(record.providerId), name = normalizeOptionalText(record.name);
  if (!id || !providerId || !name || typeof record.contextLength !== 'number' || !Number.isFinite(record.contextLength)) { return []; }
  const capabilities = typeof record.capabilities === 'object' && record.capabilities !== null
    ? {
      reasoning: record.capabilities.reasoning === true,
      toolCall: record.capabilities.toolCall === true,
      input: { image: record.capabilities.input?.image === true, text: record.capabilities.input?.text !== false },
      output: { image: record.capabilities.output?.image === true, text: record.capabilities.output?.text !== false },
    }
    : { reasoning: false, toolCall: false, input: { image: false, text: true }, output: { image: false, text: true } };
  return [{
    capabilities,
    contextLength: record.contextLength,
    id,
    name,
    providerId,
    ...(record.status ? { status: record.status } : {}),
  }];
}

function compareStoredModels(left: StoredAiModelConfig, right: StoredAiModelConfig): number {
  return left.providerId.localeCompare(right.providerId) || left.id.localeCompare(right.id);
}

function createEmptySettings(): AiSettingsFile {
  return { hostModelRouting: { fallbackChatModels: [], utilityModelRoles: {} }, models: [], providers: [], visionFallback: { enabled: false } };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
