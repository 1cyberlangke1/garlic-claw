jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('../../../src/app.module', () => ({
  AppModule: class AppModule {},
}));

describe('bootstrapHttpApp', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('enables shutdown hooks before listening', async () => {
    const pluginBootstrapService = {
      bootstrapBuiltins: jest.fn(),
      bootstrapProjectPlugins: jest.fn((onDrop?: (pluginId: string) => void) => {
        onDrop?.('local.removed');
      }),
    };
    const runtimeHostPluginRuntimeService = {
      deletePluginRuntimeState: jest.fn(),
    };
    const runtimeHostConversationRecordService = {
      deletePluginConversationSessions: jest.fn(),
    };
    const toolManagementSettingsService = {
      deleteSourceOverrides: jest.fn(),
    };
    const bootstrapUserService = { runStartupWarmup: jest.fn() };
    const app = {
      enableShutdownHooks: jest.fn(),
      get: jest.fn((token: { name?: string }) => {
        if (token?.name === 'PluginBootstrapService') {
          return pluginBootstrapService;
        }
        if (token?.name === 'RuntimeHostPluginRuntimeService') {
          return runtimeHostPluginRuntimeService;
        }
        if (token?.name === 'RuntimeHostConversationRecordService') {
          return runtimeHostConversationRecordService;
        }
        if (token?.name === 'ToolManagementSettingsService') {
          return toolManagementSettingsService;
        }
        if (token?.name === 'BootstrapUserService') {
          return bootstrapUserService;
        }
        throw new Error(`unexpected token: ${token?.name ?? 'unknown'}`);
      }),
      listen: jest.fn().mockResolvedValue(undefined),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
    };
    const { NestFactory } = await import('@nestjs/core');
    jest.mocked(NestFactory.create).mockResolvedValue(app as never);

    const { bootstrapHttpApp } = await import('../../../src/core/bootstrap/bootstrap-http-app');

    await bootstrapHttpApp();

    expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1);
    expect(pluginBootstrapService.bootstrapBuiltins).toHaveBeenCalledTimes(1);
    expect(pluginBootstrapService.bootstrapProjectPlugins).toHaveBeenCalledTimes(1);
    expect(runtimeHostPluginRuntimeService.deletePluginRuntimeState).toHaveBeenCalledWith('local.removed');
    expect(runtimeHostConversationRecordService.deletePluginConversationSessions).toHaveBeenCalledWith('local.removed');
    expect(toolManagementSettingsService.deleteSourceOverrides).toHaveBeenCalledWith('plugin:local.removed');
    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(bootstrapUserService.runStartupWarmup).toHaveBeenCalledTimes(1);
  });
});
