import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type {
  PluginAuthorDefinition,
  PluginAuthorTransportGovernanceHandlers,
} from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import { Injectable, NotFoundException } from '@nestjs/common';
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
      const loaded = this.loadDefinitionFromDirectory(directoryPath);
      if (!loaded) {
        continue;
      }
      nextDefinitions.set(loaded.definition.manifest.id, loaded);
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
    delete localRequire.cache[resolvedEntryFilePath];
    const loadedModule = localRequire(resolvedEntryFilePath) as Record<string, unknown>;
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
