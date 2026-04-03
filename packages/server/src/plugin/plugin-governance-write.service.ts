import type {
  JsonObject,
  PluginConfigSnapshot,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { preparePluginConfigUpdate } from './plugin-config-write.helpers';
import { preparePluginScopeUpdate } from './plugin-scope-write.helpers';
import { PluginReadService } from './plugin-read.service';

@Injectable()
export class PluginGovernanceWriteService {
  private readonly logger = new Logger(PluginGovernanceWriteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginReadService: PluginReadService,
  ) {}

  async updatePluginConfig(
    name: string,
    values: JsonObject,
  ): Promise<PluginConfigSnapshot> {
    const plugin = await this.pluginReadService.findByNameOrThrow(name);
    const prepared = preparePluginConfigUpdate({
      name,
      plugin,
      values,
      onWarn: (message) => this.logger.warn(message),
    });
    await this.prisma.plugin.update({
      where: { name },
      data: {
        config: prepared.persistedConfigJson,
      },
    });

    return prepared.snapshot;
  }

  async updatePluginScope(
    name: string,
    scope: PluginScopeSettings,
  ): Promise<PluginScopeSettings> {
    const plugin = await this.pluginReadService.findByNameOrThrow(name);
    const prepared = preparePluginScopeUpdate({
      plugin,
      scope,
    });

    await this.prisma.plugin.update({
      where: { name },
      data: prepared.updateData,
    });

    return prepared.normalizedScope;
  }
}
