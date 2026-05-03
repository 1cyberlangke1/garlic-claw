import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiHostModelRoutingConfig, AiModelRouteTarget, ProviderProtocolDriver, VisionFallbackConfig } from '@garlic-claw/shared';
import { ProjectWorktreeRootService } from '../execution/project/project-worktree-root.service';
import { createServerTestArtifactPath } from '../../core/runtime/server-workspace-paths';
import type { AiProviderStorageFile, AiSettingsFile, StoredAiModelConfig, StoredAiProviderConfig } from './ai-management.types';

const AI_PROVIDER_DIRECTORY = 'providers';
const AI_DEFAULT_SELECTION_FILE = 'settings.json';
const LEGACY_AI_SETTINGS_FILE_CANDIDATES = [
  path.join('packages', 'server', 'tmp', 'ai-settings.server.json'),
  path.join('config', 'ai-settings.json'),
] as const;

export function resolveAiSettingsPath(): string {
  if (process.env.JEST_WORKER_ID) {
    return process.env.GARLIC_CLAW_AI_SETTINGS_PATH
      ?? createServerTestArtifactPath({ prefix: 'config-ai.server.test', subdirectory: 'server' });
  }
  return process.env.GARLIC_CLAW_AI_SETTINGS_PATH
    ?? path.join(new ProjectWorktreeRootService().resolveRoot(process.cwd()), 'config', 'ai');
}

export function loadAiSettings(settingsPath: string): AiSettingsFile {
  const empty = createEmptySettings();
  try {
    fs.mkdirSync(readAiProviderDirectory(settingsPath), { recursive: true });
    migrateLegacyAiSettingsFile(settingsPath, empty);
    migrateLegacySplitFiles(settingsPath, empty);
    const providerFiles = readAiProviderStorageFiles(settingsPath);
    const settingsJson = readSettingsJson(settingsPath);
    return {
      defaultSelection: settingsJson.defaultSelection,
      hostModelRouting: settingsJson.hostModelRouting ?? cloneRoutingConfig(empty.hostModelRouting),
      models: providerFiles.flatMap((provider) => provider.persistedModels?.map(cloneStoredAiModelConfig) ?? []).sort(compareStoredModels),
      providers: providerFiles.map(({ persistedModels: _persistedModels, ...provider }) => cloneStoredProviderConfig(provider)).sort((left, right) => left.id.localeCompare(right.id)),
      visionFallback: settingsJson.visionFallback ?? { ...empty.visionFallback },
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
  writeSettingsFile(settingsPath, {
    defaultSelection: settings.defaultSelection,
    hostModelRouting: settings.hostModelRouting,
    visionFallback: settings.visionFallback,
  });
}

export function cloneRoutingConfig(config: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  return {
    fallbackChatModels: config.fallbackChatModels.map((entry) => ({ ...entry })),
    ...(config.compressionModel ? { compressionModel: { ...config.compressionModel } } : {}),
    utilityModelRoles: Object.fromEntries(Object.entries(config.utilityModelRoles).map(([role, target]) => [role, target ? { ...target } : target])) as AiHostModelRoutingConfig['utilityModelRoles'],
  };
}

export function cloneDefaultSelection(selection: AiModelRouteTarget | null): AiModelRouteTarget | null {
  return selection ? { ...selection } : null;
}

function readAiProviderDirectory(settingsPath: string): string {
  return path.join(settingsPath, AI_PROVIDER_DIRECTORY);
}

function migrateLegacyAiSettingsFile(settingsPath: string, empty: AiSettingsFile): void {
  if (process.env.GARLIC_CLAW_AI_SETTINGS_PATH || process.env.JEST_WORKER_ID) {
    return;
  }
  const projectRoot = new ProjectWorktreeRootService().resolveRoot(process.cwd());
  const legacyFilePath = LEGACY_AI_SETTINGS_FILE_CANDIDATES
    .map((candidate) => path.join(projectRoot, candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!legacyFilePath) {
    return;
  }
  const legacySettings = readLegacyAiSettingsFile(legacyFilePath, empty);
  if (legacySettings.providers.length === 0 && legacySettings.models.length === 0) {
    return;
  }
  const currentSettings = readStructuredAiSettings(settingsPath, empty);
  const mergedSettings = mergeStructuredAiSettings(currentSettings, legacySettings);
  if (!didAiSettingsChange(currentSettings, mergedSettings)) {
    archiveLegacyAiSettingsFile(legacyFilePath);
    return;
  }
  saveAiSettings(settingsPath, mergedSettings);
  archiveLegacyAiSettingsFile(legacyFilePath);
}

function readLegacyAiSettingsFile(filePath: string, empty: AiSettingsFile): AiSettingsFile {
  const parsed = readJsonFile<Partial<AiSettingsFile>>(filePath, {});
  return {
    defaultSelection: null,
    hostModelRouting: readLegacyHostModelRouting(parsed.hostModelRouting, empty.hostModelRouting),
    models: Array.isArray(parsed.models) ? parsed.models.flatMap(normalizeStoredAiModelConfig).sort(compareStoredModels) : [],
    providers: Array.isArray(parsed.providers) ? parsed.providers.flatMap(normalizeLegacyProviderConfig).sort((left, right) => left.id.localeCompare(right.id)) : [],
    visionFallback: readLegacyVisionFallback(parsed.visionFallback, empty.visionFallback),
  };
}

function readStructuredAiSettings(settingsPath: string, empty: AiSettingsFile): AiSettingsFile {
  const providerFiles = readAiProviderStorageFiles(settingsPath);
  const settingsJson = readSettingsJson(settingsPath);
  return {
    defaultSelection: settingsJson.defaultSelection,
    hostModelRouting: settingsJson.hostModelRouting ?? cloneRoutingConfig(empty.hostModelRouting),
    models: providerFiles.flatMap((provider) => provider.persistedModels?.map(cloneStoredAiModelConfig) ?? []).sort(compareStoredModels),
    providers: providerFiles.map(({ persistedModels: _persistedModels, ...provider }) => cloneStoredProviderConfig(provider)).sort((left, right) => left.id.localeCompare(right.id)),
    visionFallback: settingsJson.visionFallback ?? { ...empty.visionFallback },
  };
}

function mergeStructuredAiSettings(current: AiSettingsFile, legacy: AiSettingsFile): AiSettingsFile {
  const currentProviderIds = new Set(current.providers.map((provider) => provider.id));
  const mergedProviders = [
    ...current.providers.map(cloneStoredProviderConfig),
    ...legacy.providers.filter((provider) => !currentProviderIds.has(provider.id)).map(cloneStoredProviderConfig),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const mergedModelKeys = new Set(current.models.map((model) => `${model.providerId}::${model.id}`));
  const mergedModels = [
    ...current.models.map(cloneStoredAiModelConfig),
    ...legacy.models.filter((model) => !mergedModelKeys.has(`${model.providerId}::${model.id}`)).map(cloneStoredAiModelConfig),
  ].sort(compareStoredModels);
  return {
    defaultSelection: current.defaultSelection ?? legacy.defaultSelection ?? null,
    hostModelRouting: isEmptyRoutingConfig(current.hostModelRouting) && !isEmptyRoutingConfig(legacy.hostModelRouting)
      ? cloneRoutingConfig(legacy.hostModelRouting)
      : cloneRoutingConfig(current.hostModelRouting),
    models: mergedModels,
    providers: mergedProviders,
    visionFallback: isDefaultVisionFallback(current.visionFallback) && !isDefaultVisionFallback(legacy.visionFallback)
      ? { ...legacy.visionFallback }
      : { ...current.visionFallback },
  };
}

function didAiSettingsChange(current: AiSettingsFile, next: AiSettingsFile): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}

function archiveLegacyAiSettingsFile(filePath: string): void {
  const archivedFilePath = `${filePath}.migrated`;
  if (fs.existsSync(archivedFilePath)) {
    fs.rmSync(archivedFilePath, { force: true });
  }
  fs.renameSync(filePath, archivedFilePath);
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
    const driver = normalizeProtocolDriver(parsed.driver);
    if (!providerId || !name || !driver) { return null; }
    return {
      apiKey: normalizeOptionalText(parsed.apiKey),
      baseUrl: normalizeOptionalText(parsed.baseUrl),
      defaultModel: normalizeOptionalText(parsed.defaultModel),
      driver,
      id: providerId,
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

function normalizeLegacyProviderConfig(input: unknown): StoredAiProviderConfig[] {
  if (typeof input !== 'object' || input === null) { return []; }
  const record = input as Partial<StoredAiProviderConfig>;
  const providerId = normalizeOptionalText(record.id);
  const name = normalizeOptionalText(record.name) ?? providerId;
  const driver = normalizeProtocolDriver(record.driver);
  if (!providerId || !name || !driver) { return []; }
  return [{
    apiKey: normalizeOptionalText(record.apiKey),
    baseUrl: normalizeOptionalText(record.baseUrl),
    defaultModel: normalizeOptionalText(record.defaultModel),
    driver,
    id: providerId,
    models: Array.isArray(record.models)
      ? [...new Set(record.models.flatMap((entry) => {
        const value = normalizeOptionalText(entry);
        return value ? [value] : [];
      }))]
      : [],
    name,
  }];
}

function readLegacyHostModelRouting(value: unknown, fallback: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  if (!value || typeof value !== 'object') {
    return cloneRoutingConfig(fallback);
  }
  try {
    return cloneRoutingConfig(value as AiHostModelRoutingConfig);
  } catch {
    return cloneRoutingConfig(fallback);
  }
}

function readLegacyVisionFallback(value: unknown, fallback: AiSettingsFile['visionFallback']): AiSettingsFile['visionFallback'] {
  if (!value || typeof value !== 'object') {
    return { ...fallback };
  }
  return { ...(value as AiSettingsFile['visionFallback']) };
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

function readSettingsJson(settingsPath: string): { defaultSelection: AiModelRouteTarget | null; hostModelRouting?: AiHostModelRoutingConfig; visionFallback?: VisionFallbackConfig } {
  const raw = readJsonFile<unknown>(path.join(settingsPath, AI_DEFAULT_SELECTION_FILE), null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { defaultSelection: null };
  }
  const record = raw as Record<string, unknown>;

  // 旧格式：根级别 providerId / modelId
  if (typeof record.providerId === 'string' && typeof record.modelId === 'string') {
    return {
      defaultSelection: { providerId: record.providerId, modelId: record.modelId },
    };
  }

  const result: { defaultSelection: AiModelRouteTarget | null; hostModelRouting?: AiHostModelRoutingConfig; visionFallback?: VisionFallbackConfig } = { defaultSelection: null };

  if (record.defaultSelection && typeof record.defaultSelection === 'object') {
    result.defaultSelection = normalizeDefaultSelection(record.defaultSelection);
  }
  if (record.hostModelRouting && typeof record.hostModelRouting === 'object') {
    const routing = normalizeHostModelRouting(record.hostModelRouting);
    if (routing) {
      result.hostModelRouting = routing;
    }
  }
  if (record.visionFallback && typeof record.visionFallback === 'object') {
    const fallback = normalizeVisionFallback(record.visionFallback);
    if (fallback) {
      result.visionFallback = fallback;
    }
  }

  return result;
}

function writeSettingsFile(settingsPath: string, content: { defaultSelection: AiModelRouteTarget | null; hostModelRouting: AiHostModelRoutingConfig; visionFallback: VisionFallbackConfig }): void {
  const filePath = path.join(settingsPath, AI_DEFAULT_SELECTION_FILE);
  const data: Record<string, unknown> = {};
  if (content.defaultSelection) {
    data.defaultSelection = cloneDefaultSelection(content.defaultSelection);
  }
  data.hostModelRouting = cloneRoutingConfig(content.hostModelRouting);
  data.visionFallback = { ...content.visionFallback };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function migrateLegacySplitFiles(settingsPath: string, empty: AiSettingsFile): void {
  const settingsFilePath = path.join(settingsPath, AI_DEFAULT_SELECTION_FILE);
  const currentRaw = readJsonFile<unknown>(settingsFilePath, null);

  let defaultSelection: AiModelRouteTarget | null = null;
  let hostModelRouting: AiHostModelRoutingConfig | undefined;
  let visionFallback: VisionFallbackConfig | undefined;
  let hasLegacy = false;

  // 检测旧格式 settings.json
  if (currentRaw && typeof currentRaw === 'object' && !Array.isArray(currentRaw)) {
    const record = currentRaw as Record<string, unknown>;
    if (typeof record.providerId === 'string' && typeof record.modelId === 'string') {
      defaultSelection = { providerId: record.providerId, modelId: record.modelId };
      hasLegacy = true;
    }
    // 新格式：提取已有值
    if (!hasLegacy) {
      if (record.defaultSelection && typeof record.defaultSelection === 'object') {
        defaultSelection = normalizeDefaultSelection(record.defaultSelection);
      }
      if (record.hostModelRouting && typeof record.hostModelRouting === 'object') {
        const parsed = normalizeHostModelRouting(record.hostModelRouting);
        if (parsed) {
          hostModelRouting = parsed;
        }
      }
      if (record.visionFallback && typeof record.visionFallback === 'object') {
        const parsed = normalizeVisionFallback(record.visionFallback);
        if (parsed) {
          visionFallback = parsed;
        }
      }
    }
  }

  // 独立文件优先级更高（覆盖）
  const hostRoutingPath = path.join(settingsPath, 'host-model-routing.json');
  if (fs.existsSync(hostRoutingPath)) {
    const routing = readJsonFile<unknown>(hostRoutingPath, null);
    if (routing && typeof routing === 'object') {
      hostModelRouting = readLegacyHostModelRouting(routing, empty.hostModelRouting);
      hasLegacy = true;
    }
  }

  const visionFallbackPath = path.join(settingsPath, 'vision-fallback.json');
  if (fs.existsSync(visionFallbackPath)) {
    const fallback = readJsonFile<unknown>(visionFallbackPath, null);
    if (fallback && typeof fallback === 'object') {
      visionFallback = readLegacyVisionFallback(fallback, empty.visionFallback);
      hasLegacy = true;
    }
  }

  if (!hasLegacy) {
    return;
  }

  writeSettingsFile(settingsPath, {
    defaultSelection,
    hostModelRouting: hostModelRouting ?? cloneRoutingConfig(empty.hostModelRouting),
    visionFallback: visionFallback ?? { ...empty.visionFallback },
  });

  if (fs.existsSync(hostRoutingPath)) {
    fs.rmSync(hostRoutingPath, { force: true });
  }
  if (fs.existsSync(visionFallbackPath)) {
    fs.rmSync(visionFallbackPath, { force: true });
  }
}

function normalizeHostModelRouting(value: unknown): AiHostModelRoutingConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  try {
    return cloneRoutingConfig(value as AiHostModelRoutingConfig);
  } catch {
    return null;
  }
}

function normalizeVisionFallback(value: unknown): VisionFallbackConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return { ...(value as VisionFallbackConfig) };
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
  return { defaultSelection: null, hostModelRouting: { fallbackChatModels: [], utilityModelRoles: {} }, models: [], providers: [], visionFallback: { enabled: false } };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isEmptyRoutingConfig(config: AiHostModelRoutingConfig): boolean {
  return config.fallbackChatModels.length === 0
    && Object.keys(config.utilityModelRoles).length === 0
    && !config.compressionModel;
}

function isDefaultVisionFallback(config: AiSettingsFile['visionFallback']): boolean {
  return config.enabled !== true
    && !normalizeOptionalText(config.providerId)
    && !normalizeOptionalText(config.modelId)
    && !normalizeOptionalText(config.prompt)
    && config.maxDescriptionLength === undefined;
}

function normalizeDefaultSelection(value: unknown): AiModelRouteTarget | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<AiModelRouteTarget>;
  const providerId = normalizeOptionalText(record.providerId);
  const modelId = normalizeOptionalText(record.modelId);
  return providerId && modelId ? { providerId, modelId } : null;
}

function normalizeProtocolDriver(value: unknown): ProviderProtocolDriver | null {
  return value === 'openai' || value === 'anthropic' || value === 'gemini'
    ? value
    : null;
}
