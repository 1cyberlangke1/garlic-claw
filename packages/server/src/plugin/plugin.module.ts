import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PluginBootstrapService } from './bootstrap/plugin-bootstrap.service';
import { BuiltinPluginRegistryService } from './builtin/builtin-plugin-registry.service';
import { PluginGovernanceService } from './governance/plugin-governance.service';
import { PluginPersistenceService } from './persistence/plugin-persistence.service';
import { RuntimeEventLogService } from '../runtime/log/runtime-event-log.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
    RuntimeEventLogService,
  ],
  exports: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
    RuntimeEventLogService,
  ],
})
export class PluginModule {}
