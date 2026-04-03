import { BadRequestException } from '@nestjs/common';
import type {
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import { PluginGovernanceWriteService } from './plugin-governance-write.service';
import { PluginReadService } from './plugin-read.service';

describe('PluginGovernanceWriteService', () => {
  const prisma = {
    plugin: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const configSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        required: true,
        defaultValue: 5,
        description: '记忆检索数量',
      },
      {
        key: 'promptPrefix',
        type: 'string',
        defaultValue: '与此用户相关的记忆',
        description: '拼接到提示词前的前缀',
      },
    ],
  };

  const manifest: PluginManifest = {
    id: 'builtin.memory-context',
    name: '记忆上下文',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read', 'config:read'],
    tools: [],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
    routes: [
      {
        path: 'inspect/context',
        methods: ['GET'],
      },
    ],
    config: configSchema,
  };

  let service: PluginGovernanceWriteService;

  beforeEach(() => {
    jest.clearAllMocks();
    const pluginReadService = new PluginReadService(prisma as never);
    service = new PluginGovernanceWriteService(
      prisma as never,
      pluginReadService as never,
    );
  });

  it('validates plugin config values against the declared schema', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        manifest: {
          ...manifest,
          id: 'builtin.memory-context',
          name: 'builtin.memory-context',
        },
        config: JSON.stringify({
          limit: 8,
        }),
      }),
    );

    await expect(
      service.updatePluginConfig('builtin.memory-context', {
        limit: 'oops' as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });

  it('updates plugin config and returns resolved values with defaults', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        manifest: {
          ...manifest,
          id: 'builtin.memory-context',
          name: 'builtin.memory-context',
        },
        config: JSON.stringify({
          limit: 8,
        }),
      }),
    );
    prisma.plugin.update.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        manifest: {
          ...manifest,
          id: 'builtin.memory-context',
          name: 'builtin.memory-context',
        },
        config: JSON.stringify({
          limit: 6,
          promptPrefix: '已知用户记忆',
        }),
      }),
    );

    const result = await service.updatePluginConfig('builtin.memory-context', {
      limit: 6,
      promptPrefix: '已知用户记忆',
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: {
        config: JSON.stringify({
          limit: 6,
          promptPrefix: '已知用户记忆',
        }),
      },
    });
    expect(result).toEqual({
      schema: configSchema,
      values: {
        limit: 6,
        promptPrefix: '已知用户记忆',
      },
    });
  });

  it('stores plugin scope rules and returns the normalized result', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
      }),
    );
    prisma.plugin.update.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        defaultEnabled: false,
        conversationScopes: JSON.stringify({
          'conversation-1': true,
          'conversation-2': false,
        }),
      }),
    );

    const result = await service.updatePluginScope('builtin.memory-context', {
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
        'conversation-2': false,
      },
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: {
        defaultEnabled: false,
        conversationScopes: JSON.stringify({
          'conversation-1': true,
          'conversation-2': false,
        }),
      },
    });
    expect(result).toEqual({
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
        'conversation-2': false,
      },
    });
  });

  it('rejects protected builtin disable overrides in plugin scope updates', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.core-tools',
        runtimeKind: 'builtin',
      }),
    );

    await expect(
      service.updatePluginScope('builtin.core-tools', {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      }),
    ).rejects.toThrow('基础内建工具属于宿主必需插件，不能禁用。');

    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });
});

function createPluginRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const {
    manifest,
    manifestJson,
    ...recordOverrides
  } = overrides as Partial<Record<string, unknown>> & {
    manifest?: Partial<PluginManifest>;
    manifestJson?: string | null;
  };
  const name = typeof recordOverrides.name === 'string'
    ? recordOverrides.name
    : 'builtin.memory-context';
  const displayName = typeof recordOverrides.displayName === 'string'
    ? recordOverrides.displayName
    : name;
  const version = typeof recordOverrides.version === 'string'
    ? recordOverrides.version
    : '1.0.0';
  const runtime =
    recordOverrides.runtimeKind === 'remote'
      ? 'remote'
      : 'builtin';
  const persistedManifest: PluginManifest = {
    id: name,
    name: displayName,
    version,
    runtime,
    permissions: [],
    tools: [],
    hooks: [],
    routes: [],
    ...(typeof recordOverrides.description === 'string'
      ? { description: recordOverrides.description }
      : {}),
    ...(manifest ?? {}),
  };

  return {
    id: 'plugin-1',
    name,
    deviceType: 'builtin',
    runtimeKind: 'builtin',
    status: 'online',
    version,
    manifestJson:
      manifestJson !== undefined
        ? manifestJson
        : JSON.stringify(persistedManifest),
    config: null,
    defaultEnabled: true,
    conversationScopes: '{}',
    healthStatus: 'healthy',
    failureCount: 0,
    consecutiveFailures: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    lastSeenAt: new Date('2026-03-27T12:00:00.000Z'),
    createdAt: new Date('2026-03-27T12:00:00.000Z'),
    updatedAt: new Date('2026-03-27T12:00:00.000Z'),
    ...recordOverrides,
  };
}
