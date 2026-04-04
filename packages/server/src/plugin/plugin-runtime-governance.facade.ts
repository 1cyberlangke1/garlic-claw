import {
  finishOwnedConversationSession,
  listActiveConversationSessionInfos,
} from '@garlic-claw/shared';
import type {
  PluginActionName,
  PluginCallContext,
  PluginCapability,
  ConversationSessionRecord,
  PluginConversationSessionInfo,
  PluginManifest,
  PluginRuntimePressureSnapshot,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { isRuntimeRecordEnabledForContext } from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

interface RuntimeGovernanceRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
  transport: {
    reload?: () => Promise<void> | void;
    reconnect?: () => Promise<void> | void;
    checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
    listSupportedActions?: () => PluginActionName[];
  };
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

const PLUGIN_ACTION_ORDER: PluginActionName[] = [
  'health-check',
  'reload',
  'reconnect',
];

function getRuntimeRecordOrThrow(
  records: ReadonlyMap<string, RuntimeGovernanceRecord>,
  pluginId: string,
): RuntimeGovernanceRecord {
  const record = records.get(pluginId);
  if (!record) {
    throw new NotFoundException(`Plugin not found: ${pluginId}`);
  }

  return record;
}

async function runPromiseWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildRuntimePressureSnapshot(input: {
  activeExecutions: number;
  maxConcurrentExecutions: number;
}) {
  return {
    activeExecutions: input.activeExecutions,
    maxConcurrentExecutions: input.maxConcurrentExecutions,
  };
}

function listSupportedPluginActions(input: {
  transport: {
    listSupportedActions?(): PluginActionName[];
  };
}): PluginActionName[] {
  const actions = input.transport.listSupportedActions?.() ?? ['health-check'];
  const actionSet = new Set<PluginActionName>(actions);

  return PLUGIN_ACTION_ORDER.filter((action) => actionSet.has(action));
}

@Injectable()
export class PluginRuntimeGovernanceFacade {
  listTools(
    records: Map<string, RuntimeGovernanceRecord>,
    context?: PluginCallContext,
  ): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    tool: PluginCapability;
  }> {
    const tools: Array<{
      pluginId: string;
      runtimeKind: PluginRuntimeKind;
      tool: PluginCapability;
    }> = [];

    for (const [pluginId, record] of records) {
      if (context && !isRuntimeRecordEnabledForContext(record, context)) {
        continue;
      }

      for (const tool of record.manifest.tools ?? []) {
        tools.push({
          pluginId,
          runtimeKind: record.runtimeKind,
          tool,
        });
      }
    }

    return tools;
  }

  listPlugins(records: Map<string, RuntimeGovernanceRecord>): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
    manifest: PluginManifest;
    supportedActions: PluginActionName[];
    runtimePressure: PluginRuntimePressureSnapshot;
  }> {
    return [...records.entries()].map(([pluginId, record]) => ({
      pluginId,
      runtimeKind: record.runtimeKind,
      deviceType: record.deviceType,
      manifest: record.manifest,
      supportedActions: listSupportedPluginActions(record),
      runtimePressure: buildRuntimePressureSnapshot(record),
    }));
  }

  getRuntimePressure(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): PluginRuntimePressureSnapshot | null {
    const record = records.get(pluginId);
    if (!record) {
      return null;
    }

    return buildRuntimePressureSnapshot(record);
  }

  listSupportedActions(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): PluginActionName[] {
    const record = records.get(pluginId);
    if (!record) {
      return ['health-check'];
    }

    return listSupportedPluginActions(record);
  }

  listConversationSessions(
    sessions: Map<string, ConversationSessionRecord>,
    pluginId?: string,
  ): PluginConversationSessionInfo[] {
    return listActiveConversationSessionInfos(sessions, pluginId, Date.now());
  }

  finishConversationSessionForGovernance(
    sessions: Map<string, ConversationSessionRecord>,
    pluginId: string,
    conversationId: string,
  ): boolean {
    return finishOwnedConversationSession(sessions, pluginId, conversationId);
  }

  async runPluginAction(input: {
    records: Map<string, RuntimeGovernanceRecord>;
    pluginId: string;
    action: Exclude<PluginActionName, 'health-check'>;
  }): Promise<void> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    const handler = input.action === 'reload'
      ? record.transport.reload
      : record.transport.reconnect;
    if (!handler) {
      throw new BadRequestException(
        `插件 ${input.pluginId} 不支持治理动作 ${input.action}`,
      );
    }

    await runPromiseWithTimeout(
      Promise.resolve(handler.call(record.transport)),
      15000,
      `插件 ${input.pluginId} 治理动作 ${input.action} 执行超时`,
    );
  }

  async checkPluginHealth(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): Promise<{ ok: boolean }> {
    const record = records.get(pluginId);
    if (!record) {
      return { ok: false };
    }
    if (!record.transport.checkHealth) {
      return { ok: true };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await runPromiseWithTimeout(
          Promise.resolve(record.transport.checkHealth()),
          5000,
          `插件 ${pluginId} 健康检查超时`,
        );
        if (result.ok) {
          return result;
        }
      } catch {
        // 健康检查允许做一次轻量重试，以过滤瞬时网络抖动。
      }
    }

    return { ok: false };
  }
}
