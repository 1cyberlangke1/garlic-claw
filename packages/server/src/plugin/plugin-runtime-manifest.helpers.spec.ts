import type { PluginManifest, PluginSelfInfo } from '@garlic-claw/shared';
import { NotFoundException } from '@nestjs/common';
import {
  buildPluginErrorHookPayload,
  buildPluginErrorHookPayloadForRuntimeRecord,
  buildPluginLifecycleHookInfo,
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
  findManifestHookDescriptor,
  findManifestRouteOrThrow,
  findManifestToolOrThrow,
} from './plugin-runtime-manifest.helpers';

describe('plugin-runtime-manifest.helpers', () => {
  const manifest: PluginManifest = {
    id: 'plugin-a',
    name: 'Plugin A',
    version: '1.0.0',
    description: 'demo',
    runtime: 'builtin',
    permissions: ['state:read'],
    hooks: [
      {
        name: 'message:received',
      },
    ],
    routes: [
      {
        path: '/tools/list/',
        methods: ['GET'],
      },
    ],
    tools: [
      {
        name: 'echo',
        description: 'echo',
        parameters: {},
      },
    ],
    crons: [
      {
        name: 'tick',
        cron: '* * * * *',
      },
    ],
  };

  it('builds lifecycle and self info from runtime records', () => {
    const record = {
      manifest,
      runtimeKind: 'builtin' as const,
      deviceType: 'server',
    };

    expect(buildPluginLifecycleHookInfo(record)).toEqual({
      id: 'plugin-a',
      runtimeKind: 'builtin',
      deviceType: 'server',
      manifest,
    });

    expect(
      buildRuntimePluginSelfInfo({
        ...record,
        supportedActions: ['health-check', 'reload'],
      }),
    ).toEqual({
      id: 'plugin-a',
      name: 'Plugin A',
      version: '1.0.0',
      description: 'demo',
      runtimeKind: 'builtin',
      permissions: ['state:read'],
      hooks: [{ name: 'message:received' }],
      routes: [{ path: '/tools/list/', methods: ['GET'] }],
      crons: [{ name: 'tick', cron: '* * * * *' }],
      supportedActions: ['health-check', 'reload'],
    });
  });

  it('adds default governance actions to stored self info and clones collections', () => {
    const stored: PluginSelfInfo = {
      id: 'plugin-a',
      name: 'Plugin A',
      runtimeKind: 'remote',
      permissions: ['state:read'],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/hello',
          path: ['/hello'],
          aliases: [],
          variants: ['/hello'],
          description: 'hello',
        },
      ],
      hooks: [{ name: 'message:received' }],
      routes: [{ path: '/tools/list/', methods: ['GET'] }],
    };

    const built = buildStoredPluginSelfInfo({
      plugin: stored,
    });

    expect(built).toEqual({
      ...stored,
      permissions: ['state:read'],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/hello',
          path: ['/hello'],
          aliases: [],
          variants: ['/hello'],
          description: 'hello',
        },
      ],
      hooks: [{ name: 'message:received' }],
      routes: [{ path: '/tools/list/', methods: ['GET'] }],
      supportedActions: ['health-check'],
    });
    expect(built.permissions).not.toBe(stored.permissions);
    expect(built.commands).not.toBe(stored.commands);
    expect(built.hooks).not.toBe(stored.hooks);
    expect(built.routes).not.toBe(stored.routes);
  });

  it('builds plugin:error hook payloads from runtime or fallback metadata', () => {
    expect(
      buildPluginErrorHookPayload({
        pluginId: 'plugin-a',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
        occurredAt: '2026-04-01T12:00:00.000Z',
        runtimeInfo: {
          manifest,
          runtimeKind: 'builtin',
          deviceType: 'server',
        },
      }),
    ).toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
      },
      plugin: {
        id: 'plugin-a',
        runtimeKind: 'builtin',
        deviceType: 'server',
        manifest,
      },
      error: {
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
      },
      occurredAt: '2026-04-01T12:00:00.000Z',
    });

    expect(
      buildPluginErrorHookPayload({
        pluginId: 'remote.plugin-a',
        context: {
          source: 'plugin',
        },
        type: 'route:error',
        message: 'route exploded',
      }),
    ).toMatchObject({
      context: {
        source: 'plugin',
      },
      plugin: {
        id: 'remote.plugin-a',
        runtimeKind: 'remote',
        deviceType: 'remote',
        manifest: null,
      },
      error: {
        type: 'route:error',
        message: 'route exploded',
        metadata: null,
      },
    });

    expect(
      buildPluginErrorHookPayloadForRuntimeRecord({
        pluginId: 'plugin-a',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
        occurredAt: '2026-04-01T12:00:00.000Z',
        record: {
          manifest,
          runtimeKind: 'builtin',
          deviceType: 'server',
        },
      }),
    ).toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
      },
      plugin: {
        id: 'plugin-a',
        runtimeKind: 'builtin',
        deviceType: 'server',
        manifest,
      },
      error: {
        type: 'tool:error',
        message: 'tool exploded',
        metadata: {
          toolName: 'echo',
        },
      },
      occurredAt: '2026-04-01T12:00:00.000Z',
    });
  });

  it('finds hook, route, and tool descriptors', () => {
    expect(findManifestHookDescriptor(manifest, 'message:received')).toEqual({
      name: 'message:received',
    });
    expect(findManifestHookDescriptor(manifest, 'chat:before-model')).toBeNull();

    expect(findManifestRouteOrThrow(manifest, 'GET', 'tools/list')).toEqual({
      path: '/tools/list/',
      methods: ['GET'],
    });
    expect(findManifestToolOrThrow(manifest, 'echo')).toEqual({
      name: 'echo',
      description: 'echo',
      parameters: {},
    });
  });

  it('throws clear errors when route or tool are missing', () => {
    expect(() => findManifestRouteOrThrow(manifest, 'POST', '/missing')).toThrow(
      NotFoundException,
    );
    expect(() => findManifestToolOrThrow(manifest, 'missing')).toThrow(
      'Tool not found: plugin-a:missing',
    );
  });
});
