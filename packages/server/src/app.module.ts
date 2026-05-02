import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PluginGatewayWsModule } from './adapters/ws/plugin-gateway/plugin-gateway.module';
import { AiManagementModule } from './ai-management/ai-management.module';
import { AuthModule } from './auth/auth.module';
import { ConversationModule } from './conversation/conversation.module';
import { ExecutionApiModule } from './execution/execution-api.module';
import { HealthModule } from './health/health.module';
import { PersonaModule } from './persona/persona.module';
import { PluginApiModule } from './plugin/plugin-api.module';
import { HostApiModule } from './runtime/host/host-api.module';
import { ServerWorkspaceLifecycleService } from './runtime/server-workspace-lifecycle.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    AiManagementModule,
    AuthModule,
    ConversationModule,
    ExecutionApiModule,
    HealthModule,
    PluginGatewayWsModule,
    PersonaModule,
    PluginApiModule,
    HostApiModule,
  ],
  providers: [ServerWorkspaceLifecycleService],
})
export class AppModule {}
