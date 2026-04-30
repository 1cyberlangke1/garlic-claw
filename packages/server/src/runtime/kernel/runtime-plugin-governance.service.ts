import type { PluginActionName, PluginHealthSnapshot, PluginHealthStatus } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeGatewayConnectionLifecycleService } from '../gateway/runtime-gateway-connection-lifecycle.service';

const LOCAL_PLUGIN_ACTIONS: PluginActionName[] = ['health-check'];
const REMOTE_PLUGIN_ACTIONS: PluginActionName[] = ['health-check', 'reload', 'reconnect', 'refresh-metadata'];
const REMOTE_PLUGIN_ACTION_MESSAGES = {
  'refresh-metadata': '已请求远程插件重新同步元数据',
  reconnect: '已请求远程插件重连',
  reload: '已触发远程插件重连',
} as const;

@Injectable()
export class RuntimePluginGovernanceService {
  private readonly failureCounts = new Map<string, { consecutive: number; total: number }>();
  private readonly healthSnapshots = new Map<string, PluginHealthSnapshot>();

  constructor(
    private readonly pluginBootstrapService: PluginBootstrapService,
    private readonly runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
  ) {}

  async checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    return readPluginHealth(this.pluginBootstrapService.getPlugin(pluginId), pluginId, this.runtimeGatewayConnectionLifecycleService);
  }
  async readPluginHealthSnapshot(pluginId: string): Promise<PluginHealthSnapshot> {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    const ok = (await readPluginHealth(plugin, pluginId, this.runtimeGatewayConnectionLifecycleService)).ok;
    const snapshot = createPluginHealthSnapshot(plugin, ok, this.failureCounts, this.healthSnapshots.get(pluginId) ?? null);
    this.healthSnapshots.set(pluginId, snapshot);
    return { ...snapshot };
  }

  readStoredPluginHealthSnapshot(pluginId: string): PluginHealthSnapshot | null {
    const snapshot = this.healthSnapshots.get(pluginId);
    return snapshot ? { ...snapshot } : null;
  }

  listPlugins(): RegisteredPluginRecord[] { return this.pluginBootstrapService.listPlugins().sort((left, right) => left.pluginId.localeCompare(right.pluginId)); }

  listSupportedActions(pluginId: string): PluginActionName[] {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    if (plugin.manifest.runtime !== 'local') {
      return [...REMOTE_PLUGIN_ACTIONS];
    }
    return this.pluginBootstrapService.canReloadBuiltin(pluginId)
      ? [...LOCAL_PLUGIN_ACTIONS, 'reload']
      : [...LOCAL_PLUGIN_ACTIONS];
  }

  async runPluginAction(input: { action: PluginActionName; pluginId: string }) {
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    if (input.action === 'health-check') {
      const snapshot = await this.readPluginHealthSnapshot(input.pluginId);
      return createAcceptedActionResult(input.pluginId, input.action, snapshot.status === 'healthy' ? '插件健康检查通过' : '插件健康检查失败');
    }
    if (input.action === 'reload' && plugin.manifest.runtime === 'local' && this.pluginBootstrapService.canReloadBuiltin(input.pluginId)) {
      this.pluginBootstrapService.reloadBuiltin(input.pluginId);
      return createAcceptedActionResult(input.pluginId, input.action, '已重新装载本地插件');
    }
    if (plugin.manifest.runtime !== 'remote' || (input.action !== 'reload' && input.action !== 'reconnect' && input.action !== 'refresh-metadata')) {
      throw new BadRequestException(`Plugin ${input.pluginId} does not support action ${input.action}`);
    }
    this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(input.pluginId);
    return createAcceptedActionResult(input.pluginId, input.action, REMOTE_PLUGIN_ACTION_MESSAGES[input.action]);
  }
}

function createAcceptedActionResult(pluginId: string, action: PluginActionName, message: string) {
  return { accepted: true, action, pluginId, message };
}

async function readPluginHealth(
  plugin: RegisteredPluginRecord,
  pluginId: string,
  runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
): Promise<{ ok: boolean }> {
  return plugin.manifest.runtime === 'remote'
    ? runtimeGatewayConnectionLifecycleService.probePluginHealth(pluginId)
    : { ok: plugin.connected };
}

function createPluginHealthSnapshot(
  plugin: RegisteredPluginRecord,
  ok: boolean,
  failureCounts: Map<string, { consecutive: number; total: number }>,
  previousSnapshot: PluginHealthSnapshot | null,
): PluginHealthSnapshot {
  const checkedAt = new Date().toISOString();
  const status = readPluginHealthStatus(plugin, ok);
  const prev = failureCounts.get(plugin.pluginId) ?? { consecutive: 0, total: 0 };

  if (status === 'error') {
    prev.consecutive += 1;
    prev.total += 1;
  } else {
    prev.consecutive = 0;
  }
  failureCounts.set(plugin.pluginId, prev);

  return {
    consecutiveFailures: prev.consecutive,
    failureCount: prev.total,
    lastCheckedAt: checkedAt,
    lastError: status === 'error' ? '插件健康检查失败' : null,
    lastErrorAt: status === 'error' ? checkedAt : null,
    lastSuccessAt: ok ? checkedAt : previousSnapshot?.lastSuccessAt ?? null,
    status,
  };
}

function readPluginHealthStatus(
  plugin: RegisteredPluginRecord,
  ok: boolean,
): PluginHealthStatus {
  if (!plugin.connected) {
    return 'offline';
  }
  if (plugin.status === 'error') {
    return 'error';
  }
  if (!ok) {
    return plugin.manifest.runtime === 'remote' ? 'offline' : 'error';
  }
  return 'healthy';
}
