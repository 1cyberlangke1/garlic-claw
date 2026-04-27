import { Injectable, NotFoundException } from '@nestjs/common';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';
import { BUILTIN_MEMORY_PLUGIN } from './builtin-memory.plugin';

const RETIRED_BUILTIN_PLUGIN_IDS = [
  'builtin.memory-context',
  'builtin.memory-tools',
  'builtin.runtime-tools',
  'builtin.subagent-delegate',
  'builtin.conversation-title',
  'builtin.context-compaction',
] as const;

@Injectable()
export class BuiltinPluginRegistryService {
  private readonly definitions: BuiltinPluginDefinition[] = [
    BUILTIN_MEMORY_PLUGIN,
  ];

  hasDefinition(pluginId: string): boolean {
    return this.definitions.some((entry) => entry.manifest.id === pluginId);
  }

  getDefinition(pluginId: string): BuiltinPluginDefinition {
    const definition = this.definitions.find((entry) => entry.manifest.id === pluginId);
    if (!definition) {
      throw new NotFoundException(`Builtin plugin definition not found: ${pluginId}`);
    }
    return cloneBuiltinDefinition(definition);
  }

  listDefinitions(): BuiltinPluginDefinition[] {
    return this.definitions.map(cloneBuiltinDefinition);
  }

  listRetiredPluginIds(): string[] {
    return [...RETIRED_BUILTIN_PLUGIN_IDS];
  }
}

function cloneBuiltinDefinition(definition: BuiltinPluginDefinition): BuiltinPluginDefinition {
  return {
    ...structuredClone({
      ...(definition.governance ? { governance: definition.governance } : {}),
      manifest: definition.manifest,
    }),
    ...(definition.tools ? { tools: { ...definition.tools } } : {}),
    ...(definition.hooks ? { hooks: { ...definition.hooks } } : {}),
    ...(definition.routes ? { routes: { ...definition.routes } } : {}),
  };
}
