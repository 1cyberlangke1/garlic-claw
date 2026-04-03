import type { McpServerConfig } from '@garlic-claw/shared';
import { McpService } from './mcp.service';

describe('McpService', () => {
  const configService = {
    get: jest.fn(),
  };
  const mcpConfig = {
    getSnapshot: jest.fn(),
    getServer: jest.fn(),
  };
  const toolSettings = {
    getSourceEnabled: jest.fn(),
  };
  const moduleRef = {
    get: jest.fn(),
  };

  let service: McpService;

  function createServer(name: string): McpServerConfig {
    return {
      name,
      command: 'npx',
      args: ['-y', `${name}-mcp`],
      env: {},
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    moduleRef.get.mockReturnValue(toolSettings);
    toolSettings.getSourceEnabled.mockReturnValue(undefined);
    service = new McpService(
      configService as never,
      mcpConfig as never,
      moduleRef as never,
    );
  });

  it('skips disabled MCP sources during config reload warmup', async () => {
    const weather = createServer('weather');
    const tavily = createServer('tavily');
    mcpConfig.getSnapshot.mockResolvedValue({
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [weather, tavily],
    });
    toolSettings.getSourceEnabled.mockImplementation((kind: string, id: string) =>
      kind === 'mcp' && id === 'weather' ? false : undefined);
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients')
      .mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer')
      .mockResolvedValue(undefined);

    await service.reloadServersFromConfig();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith('tavily', tavily);
    expect(service.listServerStatuses()).toEqual([
      expect.objectContaining({
        name: 'weather',
        enabled: false,
        connected: false,
        health: 'unknown',
      }),
      expect.objectContaining({
        name: 'tavily',
        enabled: true,
      }),
    ]);
  });

  it('disconnects runtime state and rejects tool calls when a source is disabled online', async () => {
    const weather = createServer('weather');
    const client = {
      callTool: jest.fn(),
      close: jest.fn(),
    };
    const disconnectSpy = jest.spyOn(service as any, 'disconnectServer')
      .mockResolvedValue(undefined);

    mcpConfig.getServer.mockResolvedValue(weather);
    (service as any).clients.set('weather', client);
    (service as any).serverRecords.set('weather', {
      config: weather,
      status: {
        name: 'weather',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T10:00:00.000Z',
      },
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: null,
        },
      ],
    });

    await service.setServerEnabled('weather', false);

    expect(disconnectSpy).toHaveBeenCalledWith('weather');
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [
        expect.objectContaining({
          name: 'weather',
          enabled: false,
          connected: false,
          health: 'unknown',
        }),
      ],
      tools: [],
    });
    await expect(service.callTool({
      serverName: 'weather',
      toolName: 'get_forecast',
      arguments: {},
    })).rejects.toThrow('MCP 服务器 "weather" 已禁用');
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('connects a source when it is enabled online', async () => {
    const weather = createServer('weather');
    mcpConfig.getServer.mockResolvedValue(weather);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer')
      .mockResolvedValue(undefined);

    await service.setServerEnabled('weather', true);

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith('weather', weather);
    expect(service.listServerStatuses()).toEqual([
      expect.objectContaining({
        name: 'weather',
        enabled: true,
        connected: false,
        health: 'unknown',
      }),
    ]);
  });

  it('applies one MCP server config without disconnecting other runtime records', async () => {
    const weather = createServer('weather');
    const tavily = createServer('tavily');
    jest.spyOn(service as any, 'disconnectAllClients')
      .mockResolvedValue(undefined);
    const disconnectSpy = jest.spyOn(service as any, 'disconnectServer')
      .mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer')
      .mockResolvedValue(undefined);

    (service as any).serverRecords.set('tavily', {
      config: tavily,
      status: {
        name: 'tavily',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T12:00:00.000Z',
      },
      tools: [],
    });

    await service.applyServerConfig(weather);

    expect((service as any).disconnectAllClients).not.toHaveBeenCalled();
    expect(disconnectSpy).toHaveBeenCalledWith('weather');
    expect(connectSpy).toHaveBeenCalledWith('weather', weather);
    expect(service.listServerStatuses()).toEqual([
      expect.objectContaining({
        name: 'tavily',
        enabled: true,
      }),
      expect.objectContaining({
        name: 'weather',
        enabled: true,
      }),
    ]);
  });

  it('removes one MCP server runtime record without reloading the whole MCP runtime', async () => {
    const weather = createServer('weather');
    const disconnectSpy = jest.spyOn(service as any, 'disconnectServer')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'disconnectAllClients')
      .mockResolvedValue(undefined);

    (service as any).serverRecords.set('weather', {
      config: weather,
      status: {
        name: 'weather',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T12:00:00.000Z',
      },
      tools: [],
    });

    await service.removeServer('weather');

    expect(disconnectSpy).toHaveBeenCalledWith('weather');
    expect((service as any).disconnectAllClients).not.toHaveBeenCalled();
    expect(service.listServerStatuses()).toEqual([]);
  });
});
