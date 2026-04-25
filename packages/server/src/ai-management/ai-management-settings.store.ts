import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiHostModelRoutingConfig, AiProviderMode, VisionFallbackConfig } from '@garlic-claw/shared';
import { ProjectWorktreeRootService } from '../execution/project/project-worktree-root.service';
import type {
  AiProviderStorageFile,
  AiSettingsFile,
  StoredAiModelConfig,
  StoredAiProviderConfig,
} from './ai-management.types';

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
    return {
      hostModelRouting: readAiHostModelRouting(settingsPath, empty.hostModelRouting),
      models: readAiPersistedModels(settingsPath),
      providers: readAiProviders(settingsPath),
      visionFallback: readAiVisionFallback(settingsPath, empty.visionFallback),
    };
  } catch {
    return empty;
  }
}

export function saveAiSettings(settingsPath: string, settings: AiSettingsFile): void {
  const providerDirectory = readAiProviderDirectory(settingsPath);
  fs.mkdirSync(providerDirectory, { recursive: true });

  const persistedModelMap = new Map<string, StoredAiModelConfig[]>();
  for (const model of settings.models) {
    const current = persistedModelMap.get(model.providerId) ?? [];
    current.push(cloneStoredAiModelConfig(model));
    persistedModelMap.set(model.providerId, current);
  }

  const activeProviderIds = new Set(settings.providers.map((provider) => provider.id));
  for (const entry of fs.readdirSync(providerDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }
    const providerId = decodeURIComponent(path.basename(entry.name, '.json'));
    if (!activeProviderIds.has(providerId)) {
      fs.rmSync(path.join(providerDirectory, entry.name), { force: true });
    }
  }

  for (const provider of settings.providers) {
    const providerFile: AiProviderStorageFile = {
      ...cloneStoredProviderConfig(provider),
      persistedModels: (persistedModelMap.get(provider.id) ?? []).map(cloneStoredAiModelConfig),
    };
    fs.writeFileSync(
      path.join(providerDirectory, `${encodeURIComponent(provider.id)}.json`),
      JSON.stringify(providerFile, null, 2),
      'utf-8',
    );
  }

  fs.writeFileSync(
    path.join(settingsPath, AI_HOST_MODEL_ROUTING_FILE),
    JSON.stringify(cloneRoutingConfig(settings.hostModelRouting), null, 2),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(settingsPath, AI_VISION_FALLBACK_FILE),
    JSON.stringify({ ...settings.visionFallback }, null, 2),
    'utf-8',
  );
}

export function cloneRoutingConfig(config: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  return {
    fallbackChatModels: config.fallbackChatModels.map((entry) => ({ ...entry })),
    ...(config.compressionModel ? { compressionModel: { ...config.compressionModel } } : {}),
    utilityModelRoles: Object.fromEntries(
      Object.entries(config.utilityModelRoles).map(([role, target]) => [role, target ? { ...target } : target]),
    ) as AiHostModelRoutingConfig['utilityModelRoles'],
  };
}

function readAiProviderDirectory(settingsPath: string): string {
  return path.join(settingsPath, AI_PROVIDER_DIRECTORY);
}

function readAiProviders(settingsPath: string): StoredAiProviderConfig[] {
  const providerDirectory = readAiProviderDirectory(settingsPath);
  return fs.readdirSync(providerDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .map((entry) => readAiProviderStorageFile(path.join(providerDirectory, entry.name)))
    .filter((entry): entry is AiProviderStorageFile => entry !== null)
    .map(({ persistedModels: _persistedModels, ...provider }) => cloneStoredProviderConfig(provider))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readAiPersistedModels(settingsPath: string): StoredAiModelConfig[] {
  const providerDirectory = readAiProviderDirectory(settingsPath);
  return fs.readdirSync(providerDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .flatMap((entry) => {
      const provider = readAiProviderStorageFile(path.join(providerDirectory, entry.name));
      return provider?.persistedModels?.map(cloneStoredAiModelConfig) ?? [];
    })
    .sort((left, right) => {
      const providerOrder = left.providerId.localeCompare(right.providerId);
      return providerOrder !== 0 ? providerOrder : left.id.localeCompare(right.id);
    });
}

function readAiProviderStorageFile(filePath: string): AiProviderStorageFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<AiProviderStorageFile>;
    const providerId = typeof parsed.id === 'string' && parsed.id.trim()
      ? parsed.id.trim()
      : decodeURIComponent(path.basename(filePath, '.json'));
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : providerId;
    const mode = typeof parsed.mode === 'string' ? parsed.mode as AiProviderMode : null;
    const driver = typeof parsed.driver === 'string' && parsed.driver.trim() ? parsed.driver.trim() : null;
    if (!providerId || !name || !mode || !driver) {
      return null;
    }
    return {
      apiKey: normalizeOptionalText(parsed.apiKey),
      baseUrl: normalizeOptionalText(parsed.baseUrl),
      defaultModel: normalizeOptionalText(parsed.defaultModel),
      driver,
      id: providerId,
      mode,
      models: Array.isArray(parsed.models)
        ? [...new Set(parsed.models.flatMap((entry) => {
            const modelId = normalizeOptionalText(entry);
            return modelId ? [modelId] : [];
          }))]
        : [],
      name,
      persistedModels: Array.isArray(parsed.persistedModels)
        ? parsed.persistedModels.flatMap((entry) => normalizeStoredAiModelConfig(entry))
        : [],
    };
  } catch {
    return null;
  }
}

function readAiHostModelRouting(settingsPath: string, fallback: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  try {
    const filePath = path.join(settingsPath, AI_HOST_MODEL_ROUTING_FILE);
    if (!fs.existsSync(filePath)) {
      return cloneRoutingConfig(fallback);
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AiHostModelRoutingConfig;
    return cloneRoutingConfig(parsed);
  } catch {
    return cloneRoutingConfig(fallback);
  }
}

function readAiVisionFallback(settingsPath: string, fallback: VisionFallbackConfig): VisionFallbackConfig {
  try {
    const filePath = path.join(settingsPath, AI_VISION_FALLBACK_FILE);
    if (!fs.existsSync(filePath)) {
      return { ...fallback };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as VisionFallbackConfig;
    return { ...parsed };
  } catch {
    return { ...fallback };
  }
}

function cloneStoredProviderConfig(provider: StoredAiProviderConfig): StoredAiProviderConfig {
  return {
    ...provider,
    models: [...provider.models],
  };
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
  if (typeof input !== 'object' || input === null) {
    return [];
  }
  const record = input as Partial<StoredAiModelConfig>;
  const id = normalizeOptionalText(record.id);
  const providerId = normalizeOptionalText(record.providerId);
  const name = normalizeOptionalText(record.name);
  if (!id || !providerId || !name || typeof record.contextLength !== 'number' || !Number.isFinite(record.contextLength)) {
    return [];
  }
  const capabilities = typeof record.capabilities === 'object' && record.capabilities !== null
    ? {
        reasoning: record.capabilities.reasoning === true,
        toolCall: record.capabilities.toolCall === true,
        input: {
          image: record.capabilities.input?.image === true,
          text: record.capabilities.input?.text !== false,
        },
        output: {
          image: record.capabilities.output?.image === true,
          text: record.capabilities.output?.text !== false,
        },
      }
    : {
        reasoning: false,
        toolCall: false,
        input: { image: false, text: true },
        output: { image: false, text: true },
      };
  return [{
    capabilities,
    contextLength: record.contextLength,
    id,
    name,
    providerId,
    ...(record.status ? { status: record.status } : {}),
  }];
}

function createEmptySettings(): AiSettingsFile {
  return {
    hostModelRouting: {
      fallbackChatModels: [],
      utilityModelRoles: {},
    },
    models: [],
    providers: [],
    visionFallback: { enabled: false },
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
