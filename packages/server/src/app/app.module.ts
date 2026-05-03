import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiManagementModule } from '../modules/ai-management/ai-management.module';
import { AuthModule } from '../modules/auth/auth.module';
import { CoreRuntimeModule } from '../core/runtime/core-runtime.module';
import { ConversationModule } from '../modules/conversation/conversation.module';
import { ExecutionApiModule } from '../modules/execution/execution-api.module';
import { HealthModule } from '../modules/health/health.module';
import { PersonaModule } from '../modules/persona/persona.module';
import { PluginApiModule } from '../modules/plugin/plugin-api.module';
import { PluginWsModule } from '../modules/plugin/ws/plugin-ws.module';
import { HostApiModule } from '../modules/runtime/host/host-api.module';

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
