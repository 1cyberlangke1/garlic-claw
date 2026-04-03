import { BadRequestException } from '@nestjs/common';
import { DeviceType } from '@garlic-claw/shared';
import { PluginRemoteBootstrapService } from './plugin-remote-bootstrap.service';

describe('PluginRemoteBootstrapService', () => {
  const prisma = {
    plugin: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pluginEvent: {
      create: jest.fn(),
    },
  };
  const jwtService = {
    sign: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      switch (key) {
        case 'JWT_SECRET':
          return 'jwt-secret';
        case 'REMOTE_PLUGIN_TOKEN_EXPIRES_IN':
          return '30d';
        case 'WS_PORT':
          return 23331;
        default:
          return fallback;
      }
    }),
  };

  let service: PluginRemoteBootstrapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginRemoteBootstrapService(
      prisma as never,
      jwtService as never,
      configService as never,
    );
    jwtService.sign.mockReturnValue('signed-remote-token');
  });

  it('creates an offline remote placeholder and issues bootstrap connection info', async () => {
    prisma.plugin.findUnique.mockResolvedValue(null);
    prisma.plugin.create.mockResolvedValue({
      id: 'plugin-record-1',
      name: 'remote.pc-host',
    });

    await expect(
      service.issueBootstrap({
        pluginName: 'remote.pc-host',
        deviceType: DeviceType.PC,
        displayName: '电脑助手',
        description: '远程 PC 插件',
        version: '1.0.0',
      }),
    ).resolves.toEqual({
      pluginName: 'remote.pc-host',
      deviceType: DeviceType.PC,
      serverUrl: 'ws://127.0.0.1:23331',
      token: 'signed-remote-token',
      tokenExpiresIn: '30d',
    });

    expect(prisma.plugin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'remote.pc-host',
        displayName: '电脑助手',
        deviceType: DeviceType.PC,
        runtimeKind: 'remote',
        status: 'offline',
        version: '1.0.0',
        description: '远程 PC 插件',
        healthStatus: 'unknown',
      }),
      select: {
        id: true,
      },
    });
    expect(
      JSON.parse(prisma.plugin.create.mock.calls[0]?.[0]?.data.manifestJson ?? '{}'),
    ).toEqual({
      id: 'remote.pc-host',
      name: '电脑助手',
      version: '1.0.0',
      runtime: 'remote',
      description: '远程 PC 插件',
      permissions: [],
      tools: [],
      hooks: [],
      routes: [],
    });
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'remote_plugin',
        authKind: 'remote-plugin',
        pluginName: 'remote.pc-host',
        deviceType: DeviceType.PC,
      }),
      {
        secret: 'jwt-secret',
        expiresIn: '30d',
      },
    );
    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pluginId: 'plugin-record-1',
        type: 'governance:remote-bootstrap',
        level: 'info',
      }),
    });
  });

  it('rejects bootstrap issuance for builtin plugins', async () => {
    prisma.plugin.findUnique.mockResolvedValue({
      id: 'builtin-record',
      name: 'builtin.memory-context',
      runtimeKind: 'builtin',
    });

    await expect(
      service.issueBootstrap({
        pluginName: 'builtin.memory-context',
        deviceType: DeviceType.PC,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.plugin.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
