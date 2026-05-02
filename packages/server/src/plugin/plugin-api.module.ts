import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HostModule } from '../runtime/host/host.module';
import { RuntimeKernelModule } from '../runtime/kernel/runtime-kernel.module';
import { PluginController } from './plugin.controller';
import { PluginModule } from './plugin.module';

@Module({
  imports: [AuthModule, HostModule, PluginModule, RuntimeKernelModule],
  controllers: [PluginController],
})
export class PluginApiModule {}
