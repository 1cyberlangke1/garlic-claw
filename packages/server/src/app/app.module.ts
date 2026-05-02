import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiManagementModule } from '../ai-management/ai-management.module';
import { AuthModule } from '../auth/auth.module';
import { CoreRuntimeModule } from '../core/runtime/core-runtime.module';
import { ConversationModule } from '../conversation/conversation.module';
import { ExecutionApiModule } from '../execution/execution-api.module';
import { HealthModule } from '../health/health.module';
import { PersonaModule } from '../persona/persona.module';
import { PluginApiModule } from '../plugin/plugin-api.module';
import { PluginWsModule } from '../plugin/ws/plugin-ws.module';
import { HostApiModule } from '../runtime/host/host-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    AiManagementModule,
    AuthModule,
    CoreRuntimeModule,
    ConversationModule,
    ExecutionApiModule,
    HealthModule,
    PersonaModule,
    PluginApiModule,
    PluginWsModule,
    HostApiModule,
  ],
})
export class AppModule {}
