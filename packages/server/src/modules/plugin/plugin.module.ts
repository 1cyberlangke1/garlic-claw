import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CoreLoggingModule } from '../../core/logging/core-logging.module';
import { ProjectWorktreeOverlayModule } from '../execution/project/project-worktree-overlay.module';
import { PluginBootstrapService } from './bootstrap/plugin-bootstrap.service';
import { BuiltinPluginRegistryService } from './builtin/builtin-plugin-registry.service';
import { PluginGovernanceService } from './governance/plugin-governance.service';
import { PluginPersistenceService } from './persistence/plugin-persistence.service';
import { ProjectPluginRegistryService } from './project/project-plugin-registry.service';

@Module({
  imports: [ConfigModule, JwtModule.register({}), CoreLoggingModule, ProjectWorktreeOverlayModule],
  providers: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
    ProjectPluginRegistryService,
  ],
  exports: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
    ProjectPluginRegistryService,
  ],
})
export class PluginModule {}
