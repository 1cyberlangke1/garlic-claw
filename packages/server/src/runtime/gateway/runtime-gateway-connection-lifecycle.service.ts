import { type PluginActionName, type PluginHostMethod, type PluginManifest, type PluginRemoteEnvironment } from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PluginBootstrapService, type RegisterPluginInput } from '../../plugin/bootstrap/plugin-bootstrap.service';
import type { RegisteredPluginRecord, RegisteredPluginRemoteRecord } from '../../plugin/persistence/plugin-persistence.service';
import { CONNECTION_SCOPED_PLUGIN_HOST_METHODS } from '../host/runtime-host.constants';
import type { RuntimeGatewayConnectionRecord } from './runtime-gateway.types';

const CONNECTION_SCOPED_METHODS = new Set<PluginHostMethod>(CONNECTION_SCOPED_PLUGIN_HOST_METHODS);
const DEFAULT_SUPPORTED_ACTIONS: PluginActionName[] = ['health-check', 'reload', 'reconnect', 'refresh-metadata'];

export interface RegisterRemotePluginInput extends RegisterPluginInput {
  connectionId: string;
  fallback: RegisterPluginInput['fallback'] & { runtime?: PluginManifest['runtime']; };
  remoteEnvironment: PluginRemoteEnvironment;
}

@Injectable()
export class RuntimeGatewayConnectionLifecycleService {
  private connectionHealthProbe?: (input: { connectionId: string; timeoutMs?: number }) => Promise<{ ok: boolean }>;
  private connectionCloser?: (connectionId: string) => void;
  private connectionDrain?: (connectionId: string) => void;
  private readonly connectionByPluginId = new Map<string, string>();
  private readonly connections = new Map<string, RuntimeGatewayConnectionRecord>();
  private connectionSequence = 0;

  constructor(private readonly pluginBootstrapService: PluginBootstrapService) {}

  getConnection(connectionId: string): RuntimeGatewayConnectionRecord | null {
    const connection = this.connections.get(connectionId);
    return connection ? cloneConnectionRecord(connection) : null;
  }

  readConnectionIdByPluginId(pluginId: string): string | null { return this.connectionByPluginId.get(pluginId) ?? null; }
  registerConnectionCloser(closer: (connectionId: string) => void): void { this.connectionCloser = closer; }
  registerConnectionDrain(drain: (connectionId: string) => void): void { this.connectionDrain = drain; }
  registerConnectionHealthProbe(probe: (input: { connectionId: string; timeoutMs?: number }) => Promise<{ ok: boolean }>): void { this.connectionHealthProbe = probe; }

  openConnection(input?: { connectionId?: string; remoteAddress?: string; seenAt?: string }): RuntimeGatewayConnectionRecord {
    const record = {
      authenticated: false,
      claims: null,
      connectionId: input?.connectionId ?? `runtime-connection-${++this.connectionSequence}`,
      lastHeartbeatAt: input?.seenAt ?? new Date().toISOString(),
      pluginId: null,
      remoteEnvironment: null,
      ...(input?.remoteAddress ? { remoteAddress: input.remoteAddress } : {}),
    };
    this.connections.set(record.connectionId, record);
    return cloneConnectionRecord(record);
  }

  authenticateConnection(input: {
    accessKey: string | null;
    connectionId: string;
    pluginName: string;
    remoteEnvironment: PluginRemoteEnvironment;
    seenAt?: string;
  }): RuntimeGatewayConnectionRecord {
    const remote = validateRemotePluginAuthentication(this.pluginBootstrapService.getPlugin(input.pluginName), input.remoteEnvironment, input.accessKey), previousConnectionId = this.connectionByPluginId.get(input.pluginName);
    if (previousConnectionId && previousConnectionId !== input.connectionId) { this.disconnectConnection(previousConnectionId); }
    return this.updateConnection(input.connectionId, {
      authenticated: true,
      claims: { authMode: remote.descriptor.auth.mode, pluginName: input.pluginName, remoteEnvironment: remote.descriptor.remoteEnvironment },
      lastHeartbeatAt: input.seenAt ?? new Date().toISOString(),
      pluginId: input.pluginName,
      remoteEnvironment: remote.descriptor.remoteEnvironment,
    });
  }

  registerRemotePlugin(input: RegisterRemotePluginInput): RegisteredPluginRecord {
    const pluginName = input.fallback.id, configured = this.pluginBootstrapService.getPlugin(pluginName);
    this.requireAuthenticatedPluginConnection(input.connectionId, pluginName);
    const remote = validateRemotePluginAuthentication(configured, input.remoteEnvironment, configured.remote?.access.accessKey ?? null), syncedAt = new Date().toISOString(), manifest = { ...input.manifest, remote: remote.descriptor, runtime: 'remote' as const };
    const registered = this.pluginBootstrapService.registerPlugin({
      connected: true,
      fallback: { ...input.fallback, remote: remote.descriptor, runtime: 'remote' },
      governance: input.governance,
      manifest,
      remote: {
        access: { ...remote.access },
        descriptor: structuredClone(remote.descriptor),
        metadataCache: { lastSyncedAt: syncedAt, manifestHash: createManifestHash(manifest), status: 'cached' },
      },
    });
    this.updateConnection(input.connectionId, { pluginId: pluginName, remoteEnvironment: remote.descriptor.remoteEnvironment });
    return { ...registered, manifest: { ...registered.manifest, runtime: 'remote' } };
  }

  checkHeartbeats(input: { maxIdleMs: number; now?: number }): string[] {
    const now = input.now ?? Date.now(), staleConnectionIds = [...this.connections.values()].filter((connection) => now - Date.parse(connection.lastHeartbeatAt) > input.maxIdleMs).map((connection) => connection.connectionId);
    staleConnectionIds.forEach((connectionId) => this.disconnectConnection(connectionId));
    return staleConnectionIds;
  }

  checkPluginHealth(pluginId: string): { ok: boolean } {
    const connectionId = this.connectionByPluginId.get(pluginId);
    return { ok: Boolean(connectionId && this.connections.get(connectionId)?.authenticated) };
  }

  async probePluginHealth(pluginId: string, timeoutMs?: number): Promise<{ ok: boolean }> {
    const connectionId = this.connectionByPluginId.get(pluginId), connection = connectionId ? this.connections.get(connectionId) : null;
    if (!connectionId || !connection?.authenticated) {
      return { ok: false };
    }
    if (!this.connectionHealthProbe) {
      throw new Error('插件健康探针未注册，无法对远程插件执行健康检查');
    }
    return this.connectionHealthProbe({ connectionId, timeoutMs });
  }

  disconnectConnection(connectionId: string): RegisteredPluginRecord | null {
    const connection = this.removeConnectionState(connectionId);
    if (!connection) { return null; }
    this.connectionDrain?.(connectionId);
    return this.markPluginOffline(connection.pluginId);
  }

  disconnectPlugin(pluginId: string): RegisteredPluginRecord | null {
    const connectionId = this.connectionByPluginId.get(pluginId);
    if (!connectionId) { return this.pluginBootstrapService.markPluginOffline(pluginId); }
    const disconnected = this.disconnectConnection(connectionId);
    this.connectionCloser?.(connectionId);
    return disconnected;
  }

  requireConnection(connectionId: string): RuntimeGatewayConnectionRecord {
    const connection = this.connections.get(connectionId);
    if (!connection) { throw new NotFoundException(`Gateway connection not found: ${connectionId}`); }
    return connection;
  }

  touchConnectionHeartbeat(connectionId: string, seenAt?: string): RuntimeGatewayConnectionRecord {
    const nextConnection = this.updateConnection(connectionId, { lastHeartbeatAt: seenAt ?? new Date().toISOString() });
    if (nextConnection.pluginId) { this.pluginBootstrapService.touchHeartbeat(nextConnection.pluginId, nextConnection.lastHeartbeatAt); }
    return nextConnection;
  }

  private requireAuthenticatedPluginConnection(connectionId: string, pluginId: string): RuntimeGatewayConnectionRecord {
    const connection = this.getConnection(connectionId);
    if (!connection || !connection.authenticated || connection.pluginId !== pluginId) { throw new Error(`Gateway connection is not authenticated for plugin ${pluginId}`); }
    return connection;
  }

  private removeConnectionState(connectionId: string): RuntimeGatewayConnectionRecord | null {
    const connection = this.connections.get(connectionId);
    if (!connection) { return null; }
    this.connections.delete(connectionId);
    if (connection.pluginId && this.connectionByPluginId.get(connection.pluginId) === connectionId) { this.connectionByPluginId.delete(connection.pluginId); }
    return cloneConnectionRecord(connection);
  }

  private updateConnection(connectionId: string, patch: Partial<RuntimeGatewayConnectionRecord>): RuntimeGatewayConnectionRecord {
    const connection = this.requireConnection(connectionId), previousPluginId = connection.pluginId;
    Object.assign(connection, patch);
    if (previousPluginId && previousPluginId !== connection.pluginId && this.connectionByPluginId.get(previousPluginId) === connectionId) { this.connectionByPluginId.delete(previousPluginId); }
    if (connection.pluginId) { this.connectionByPluginId.set(connection.pluginId, connectionId); }
    return cloneConnectionRecord(connection);
  }

  private markPluginOffline(pluginId: string | null): RegisteredPluginRecord | null {
    return pluginId && this.pluginBootstrapService.listPlugins().some((plugin) => plugin.pluginId === pluginId) ? this.pluginBootstrapService.markPluginOffline(pluginId) : null;
  }
}

export function isConnectionScopedHostMethod(method: PluginHostMethod): boolean { return CONNECTION_SCOPED_METHODS.has(method); }
export function readDefaultRemotePluginActions(): PluginActionName[] { return DEFAULT_SUPPORTED_ACTIONS.slice(); }

function cloneConnectionRecord(connection: RuntimeGatewayConnectionRecord): RuntimeGatewayConnectionRecord {
  return { ...connection, claims: connection.claims ? { ...connection.claims } : null };
}

function validateRemotePluginAuthentication(plugin: RegisteredPluginRecord, remoteEnvironment: PluginRemoteEnvironment, accessKey: string | null): RegisteredPluginRemoteRecord {
  if (plugin.manifest.runtime !== 'remote' || !plugin.remote) { throw new Error(`Plugin ${plugin.pluginId} is not configured as a remote plugin`); }
  if (plugin.remote.descriptor.remoteEnvironment !== remoteEnvironment) { throw new Error('Remote plugin environment does not match configured plugin slot'); }
  const expectedAccessKey = plugin.remote.access.accessKey ?? null, authMode = plugin.remote.descriptor.auth.mode;
  if (authMode === 'required' && !expectedAccessKey) { throw new Error(`Remote plugin ${plugin.pluginId} is missing a configured access key`); }
  if (authMode !== 'none' && expectedAccessKey && expectedAccessKey !== (accessKey ?? null)) { throw new Error('Remote plugin access key does not match configured plugin slot'); }
  if (authMode !== 'none' && authMode !== 'optional' && authMode !== 'required') { throw new Error('Unsupported remote plugin auth mode'); }
  return plugin.remote;
}

function createManifestHash(manifest: Partial<PluginManifest>): string {
  return Buffer.from(JSON.stringify(manifest), 'utf-8').toString('base64url');
}
