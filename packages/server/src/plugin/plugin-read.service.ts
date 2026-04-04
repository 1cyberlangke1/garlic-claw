import type {
  PluginActionName,
  JsonObject,
  ListPluginEventOptions,
  PluginEventListResult,
  PluginGovernanceInfo,
  PluginConfigSnapshot,
  PluginHealthSnapshot,
  PluginManifest,
  PluginRuntimeKind,
  PluginRuntimePressureSnapshot,
  PluginScopeSettings,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import {
  buildPluginEventFindManyInput,
  buildPluginEventListResult,
  buildPluginHealthSnapshot,
  normalizePluginEventOptions,
} from '@garlic-claw/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePluginEventCursor } from './plugin-event.helpers';
import { describePluginGovernance } from './plugin-governance-policy';
import {
  readPersistedPluginManifestRecord,
  type PersistedPluginGovernanceRecord,
} from './plugin-governance.helpers';
import { buildPluginGovernanceSnapshot } from './plugin-governance.helpers';
import { parsePluginScope } from './plugin-persistence.helpers';
import { resolvePluginConfig } from './plugin-persistence.helpers';
import type { PluginGovernanceSnapshot } from './plugin-lifecycle-write.service';

const PERSISTED_SUPPORTED_ACTIONS: PluginActionName[] = ['health-check'];

export interface RuntimePluginRecordView {
  pluginId: string;
  runtimeKind: PluginRuntimeKind;
  manifest: PluginManifest;
  supportedActions: PluginActionName[];
  runtimePressure: PluginRuntimePressureSnapshot;
}

@Injectable()
export class PluginReadService {
  private readonly logger = new Logger(PluginReadService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getGovernanceSnapshot(name: string): Promise<PluginGovernanceSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginGovernanceSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async findAll() {
    return this.prisma.plugin.findMany({ orderBy: { name: 'asc' } });
  }

  async findOnline() {
    return this.prisma.plugin.findMany({
      where: { status: 'online' },
      orderBy: { name: 'asc' },
    });
  }

  async findByName(name: string) {
    return this.prisma.plugin.findUnique({ where: { name } });
  }

  async findByNameOrThrow(name: string) {
    const plugin = await this.findByName(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }

  async getPluginConfig(name: string): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginConfigSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getResolvedConfig(name: string): Promise<JsonObject> {
    const plugin = await this.findByNameOrThrow(name);
    return buildResolvedPluginConfig({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginSelfInfo(name: string): Promise<PluginSelfInfo> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginSelfInfo({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginScope(name: string): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    return parsePluginScope({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  async getPluginHealth(name: string): Promise<PluginHealthSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginHealthSnapshot({
      plugin,
    });
  }

  async listPluginEvents(
    name: string,
    options: ListPluginEventOptions = {},
  ): Promise<PluginEventListResult> {
    const plugin = await this.findByNameOrThrow(name);
    const normalized = normalizePluginEventOptions(options);
    const cursorEvent = normalized.cursor
      ? await resolvePluginEventCursor({
        prisma: this.prisma,
        pluginId: plugin.id,
        cursor: normalized.cursor,
      })
      : null;
    const events = await this.prisma.pluginEvent.findMany({
      ...buildPluginEventFindManyInput({
        pluginId: plugin.id,
        options: normalized,
        cursorEvent,
      }),
    });
    return buildPluginEventListResult({
      events,
      limit: normalized.limit,
      onWarn: (message) => this.logger.warn(message),
    });
  }
}

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
    runtimeKind: toPluginRuntimeKind(input.plugin.runtimeKind),
    version: manifest.version || undefined,
    description: manifest.description ?? undefined,
    permissions: [...manifest.permissions],
    ...(manifest.crons ? { crons: [...manifest.crons] } : {}),
    ...(manifest.commands ? { commands: [...manifest.commands] } : {}),
    hooks: [...(manifest.hooks ?? [])],
    routes: [...(manifest.routes ?? [])],
  };
}

export function buildMergedPluginView(input: {
  plugin: PersistedPluginGovernanceRecord;
  runtimePlugin?: RuntimePluginRecordView | null;
  onWarn?: (message: string) => void;
}): {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  governance: PluginGovernanceInfo;
  connected: boolean;
  pluginDisplayName: string;
  supportedActions: PluginActionName[];
  runtimePressure: PluginRuntimePressureSnapshot | null;
} {
  const manifest = input.runtimePlugin?.manifest ?? readPersistedPluginManifestRecord(input);
  const runtimeKind = input.runtimePlugin?.runtimeKind ?? toPluginRuntimeKind(input.plugin.runtimeKind);

  return {
    manifest,
    runtimeKind,
    governance: describePluginGovernance({
      pluginId: input.plugin.name,
      runtimeKind,
    }),
    connected: Boolean(input.runtimePlugin),
    pluginDisplayName: input.runtimePlugin?.manifest.name ?? input.plugin.displayName ?? input.plugin.name,
    supportedActions: input.runtimePlugin?.supportedActions ?? PERSISTED_SUPPORTED_ACTIONS,
    runtimePressure: input.runtimePlugin?.runtimePressure ?? null,
  };
}

function toPluginRuntimeKind(runtimeKind?: string | null): PluginRuntimeKind {
  return runtimeKind === 'builtin' ? 'builtin' : 'remote';
}
