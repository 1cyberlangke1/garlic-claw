import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { BootstrapUserService } from '../../auth/bootstrap-user.service';
import { ToolManagementSettingsService } from '../../execution/tool/tool-management-settings.service';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import { RuntimeHostConversationRecordService } from '../../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginRuntimeService } from '../../runtime/host/runtime-host-plugin-runtime.service';
import { RuntimePluginGovernanceService } from '../../runtime/kernel/runtime-plugin-governance.service';

const DEFAULT_GLOBAL_PREFIX = 'api';
const DEFAULT_HTTP_PORT = 23330;

export async function bootstrapHttpApp(): Promise<void> {
  const { globalPrefix, port } = readHttpServerConfig();
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const pluginBootstrapService = app.get(PluginBootstrapService);
  const runtimeHostConversationRecordService = app.get(RuntimeHostConversationRecordService);
  const runtimeHostPluginRuntimeService = app.get(RuntimeHostPluginRuntimeService);
  const runtimePluginGovernanceService = app.get(RuntimePluginGovernanceService);
  const toolManagementSettingsService = app.get(ToolManagementSettingsService);
  pluginBootstrapService.bootstrapBuiltins();
  pluginBootstrapService.bootstrapProjectPlugins((pluginId) => {
    runtimeHostPluginRuntimeService.deletePluginRuntimeState(pluginId);
    runtimeHostConversationRecordService.deletePluginConversationSessions(pluginId);
    runtimePluginGovernanceService.deletePluginRuntimeState(pluginId);
    toolManagementSettingsService.deleteSourceOverrides(`plugin:${pluginId}`);
  });

  await app.listen(port);
  void app.get(BootstrapUserService).runStartupWarmup();
}

export function readHttpServerConfig(env: NodeJS.ProcessEnv = process.env): {
  globalPrefix: string;
  port: number;
} {
  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_HTTP_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  return {
    globalPrefix: env.HTTP_GLOBAL_PREFIX?.trim() || DEFAULT_GLOBAL_PREFIX,
    port,
  };
}
