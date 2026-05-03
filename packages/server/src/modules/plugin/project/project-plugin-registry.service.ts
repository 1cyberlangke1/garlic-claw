import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type {
  PluginAuthorDefinition,
  PluginAuthorTransportGovernanceHandlers,
} from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import { Injectable, NotFoundException } from '@nestjs/common';
import { createServerLogger } from '../../../core/logging/server-logger';
import { ProjectWorktreeRootService } from '../../execution/project/project-worktree-root.service';

type ProjectPluginRuntime = 'local' | 'remote';

interface ProjectPluginPackageConfig {
  definitionExport?: string;
  runtime?: ProjectPluginRuntime;
}

interface ProjectPluginPackageJson {
  garlicClaw?: ProjectPluginPackageConfig;
  main?: string;
  name?: string;
}

const localRequire = createRequire(__filename);

export interface ProjectPluginDefinitionRecord {
  definition: PluginAuthorDefinition<PluginHostFacadeMethods>;
  directoryPath: string;
  entryFilePath: string;
  transportGovernance?: PluginAuthorTransportGovernanceHandlers;
}

@Injectable()
export class ProjectPluginRegistryService {
  private readonly definitions = new Map<string, ProjectPluginDefinitionRecord>();
  private readonly logger = createServerLogger(ProjectPluginRegistryService.name);

  constructor(
    private readonly projectWorktreeRootService: ProjectWorktreeRootService,
  ) {}

  hasDefinition(pluginId: string): boolean {
    return this.definitions.has(pluginId);
  }

  getDefinition(pluginId: string): ProjectPluginDefinitionRecord {
    const definition = this.definitions.get(pluginId);
    if (!definition) {
      throw new NotFoundException(`Project plugin definition not found: ${pluginId}`);
    }
    return cloneProjectPluginDefinitionRecord(definition);
  }

  loadDefinitions(): ProjectPluginDefinitionRecord[] {
    const nextDefinitions = new Map<string, ProjectPluginDefinitionRecord>();
    for (const directoryPath of this.listPluginDirectories()) {
      try {
        const loaded = this.loadDefinitionFromDirectory(directoryPath);
        if (!loaded) {
          continue;
        }
        const existing = nextDefinitions.get(loaded.definition.manifest.id);
        if (existing) {
          throw new Error(
            `本地插件 manifest.id 冲突: ${loaded.definition.manifest.id} 已被目录 ${existing.directoryPath} 使用，当前目录 ${directoryPath}`,
          );
        }
        nextDefinitions.set(loaded.definition.manifest.id, loaded);
      } catch (error) {
        this.logger.warn(readProjectPluginLoadErrorMessage(directoryPath, error));
      }
    }
    this.definitions.clear();
    for (const [pluginId, definition] of nextDefinitions.entries()) {
      this.definitions.set(pluginId, definition);
    }
    return [...this.definitions.values()].map(cloneProjectPluginDefinitionRecord);
  }

  reloadDefinition(pluginId: string): ProjectPluginDefinitionRecord {
    this.loadDefinitions();
    return this.getDefinition(pluginId);
  }

  private listPluginDirectories(): string[] {
    const pluginsRootPath = path.join(
      this.projectWorktreeRootService.resolveRoot(process.cwd()),
      'config',
      'plugins',
    );
    if (!fs.existsSync(pluginsRootPath)) {
      return [];
    }
    return fs
      .readdirSync(pluginsRootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(pluginsRootPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  }

  private loadDefinitionFromDirectory(
    directoryPath: string,
  ): ProjectPluginDefinitionRecord | null {
    const packageJsonPath = path.join(directoryPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return null;
    }
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf-8'),
    ) as ProjectPluginPackageJson;
    const config = packageJson.garlicClaw ?? {};
    if (config.runtime === 'remote') {
      return null;
    }

    const entryFilePath = path.resolve(
      directoryPath,
      packageJson.main?.trim() || 'dist/index.js',
    );
    if (!fs.existsSync(entryFilePath)) {
      if (config.runtime === 'local') {
        throw new Error(
          `本地插件缺少可加载入口: ${entryFilePath}（插件目录 ${directoryPath}）`,
        );
      }
      return null;
    }

    const resolvedEntryFilePath = localRequire.resolve(entryFilePath);
    const loadedModule = loadProjectPluginModule(
      resolvedEntryFilePath,
      directoryPath,
    ) as Record<string, unknown>;
    const definition = resolveProjectPluginDefinition(
      loadedModule,
      config.definitionExport,
    );
    if (!definition) {
      if (config.runtime === 'local') {
        throw new Error(
          `本地插件 ${packageJson.name ?? directoryPath} 未导出合法 definition`,
        );
      }
      return null;
    }

    return {
      definition,
      directoryPath,
      entryFilePath,
      ...(isTransportGovernanceHandlers(loadedModule.transportGovernance)
        ? { transportGovernance: loadedModule.transportGovernance }
        : {}),
    };
  }
}

function resolveProjectPluginDefinition(
  loadedModule: Record<string, unknown>,
  definitionExport: string | undefined,
): PluginAuthorDefinition<PluginHostFacadeMethods> | null {
  if (definitionExport) {
    const candidate = loadedModule[definitionExport];
    return isPluginAuthorDefinition(candidate)
      ? (candidate as PluginAuthorDefinition<PluginHostFacadeMethods>)
      : null;
  }

  const candidates = [
    loadedModule.definition,
    loadedModule.plugin,
    loadedModule.default,
    loadedModule,
  ];
  for (const candidate of candidates) {
    if (isPluginAuthorDefinition(candidate)) {
      return candidate as PluginAuthorDefinition<PluginHostFacadeMethods>;
    }
  }
  return null;
}

function isPluginAuthorDefinition(
  value: unknown,
): value is PluginAuthorDefinition<PluginHostFacadeMethods> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const definition = value as {
    manifest?: {
      id?: unknown;
      permissions?: unknown;
      runtime?: unknown;
      tools?: unknown;
      version?: unknown;
    };
  };
  return Boolean(
    definition.manifest
      && typeof definition.manifest.id === 'string'
      && Array.isArray(definition.manifest.permissions)
      && Array.isArray(definition.manifest.tools)
      && typeof definition.manifest.version === 'string'
      && definition.manifest.runtime === 'local',
  );
}

function isTransportGovernanceHandlers(
  value: unknown,
): value is PluginAuthorTransportGovernanceHandlers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const handlers = value as Record<string, unknown>;
  return (
    typeof handlers.reload === 'function'
    || typeof handlers.reconnect === 'function'
    || typeof handlers.checkHealth === 'function'
  );
}

function cloneProjectPluginDefinitionRecord(
  record: ProjectPluginDefinitionRecord,
): ProjectPluginDefinitionRecord {
  return {
    definition: {
      ...structuredClone({
        manifest: record.definition.manifest,
      }),
      ...(record.definition.tools ? { tools: { ...record.definition.tools } } : {}),
      ...(record.definition.hooks ? { hooks: { ...record.definition.hooks } } : {}),
      ...(record.definition.routes ? { routes: { ...record.definition.routes } } : {}),
    },
    directoryPath: record.directoryPath,
    entryFilePath: record.entryFilePath,
    ...(record.transportGovernance
      ? { transportGovernance: record.transportGovernance }
      : {}),
  };
}

function readProjectPluginLoadErrorMessage(
  directoryPath: string,
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return `跳过损坏的本地项目插件目录 ${directoryPath}: ${message}`;
}

function loadProjectPluginModule(
  entryFilePath: string,
  directoryPath: string,
  cache = new Map<string, unknown>(),
): unknown {
  const normalizedEntryFilePath = path.resolve(entryFilePath);
  const cached = cache.get(normalizedEntryFilePath);
  if (cached !== undefined) {
    return cached;
  }
  if (path.extname(normalizedEntryFilePath).toLowerCase() === '.json') {
    const parsed = JSON.parse(fs.readFileSync(normalizedEntryFilePath, 'utf-8'));
    cache.set(normalizedEntryFilePath, parsed);
    return parsed;
  }
  const exportsObject: Record<string, unknown> = {};
  const moduleRecord = {
    exports: exportsObject as unknown,
  } as {
    exports: unknown;
  };
  cache.set(normalizedEntryFilePath, moduleRecord.exports);
  const moduleRequire = createRequire(normalizedEntryFilePath);
  const normalizedDirectoryPath = path.resolve(directoryPath).toLowerCase();
  const source = fs.readFileSync(normalizedEntryFilePath, 'utf-8');
  const wrapped = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    source,
  ) as (
    exports: Record<string, unknown>,
    require: (request: string) => unknown,
    module: { exports: unknown },
    __filename: string,
    __dirname: string,
  ) => void;
  wrapped(
    exportsObject,
    (request: string) => {
      const resolvedChildPath = moduleRequire.resolve(request);
      if (
        path.resolve(resolvedChildPath).toLowerCase().startsWith(
          `${normalizedDirectoryPath}${path.sep}`,
        )
      ) {
        return loadProjectPluginModule(
          resolvedChildPath,
          directoryPath,
          cache,
        );
      }
      return moduleRequire(request);
    },
    moduleRecord,
    normalizedEntryFilePath,
    path.dirname(normalizedEntryFilePath),
  );
  cache.set(normalizedEntryFilePath, moduleRecord.exports);
  return moduleRecord.exports;
}
