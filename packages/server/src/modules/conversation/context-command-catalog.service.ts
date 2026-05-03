import type { PluginCommandCatalogVersion, PluginCommandOverview } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { buildPluginCommandCatalogVersion, buildPluginCommandOverview, listPluginCommands } from '../plugin/persistence/plugin-read-model';
import { RuntimePluginGovernanceService } from '../runtime/kernel/runtime-plugin-governance.service';
import { ContextGovernanceService } from './context-governance.service';

@Injectable()
export class ContextCommandCatalogService {
  constructor(
    private readonly contextGovernanceService: ContextGovernanceService,
    private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService,
  ) {}

  getOverview(): PluginCommandOverview {
    const pluginCommands = this.runtimePluginGovernanceService.listPlugins()
      .flatMap((plugin) => listPluginCommands(plugin, plugin.connected));
    return buildPluginCommandOverview([
      ...this.contextGovernanceService.listCommandCatalogEntries(),
      ...pluginCommands,
    ]);
  }

  getVersion(): PluginCommandCatalogVersion {
    return buildPluginCommandCatalogVersion(this.getOverview().commands);
  }
}
