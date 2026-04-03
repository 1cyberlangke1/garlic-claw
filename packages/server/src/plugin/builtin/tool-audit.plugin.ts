import {
  buildToolAuditSummary,
  persistPluginObservation,
  readPluginHookPayload,
} from '@garlic-claw/plugin-sdk';
import type { ToolAfterCallHookPayload } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建工具调用审计插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `tool:after-call` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在工具成功执行后记录最近一次调用摘要
 * - 同时向宿主事件日志写入统一审计事件
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createToolAuditPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.tool-audit',
      name: '工具审计器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证工具生命周期 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'tool:after-call',
          description: '在工具执行完成后记录调用摘要',
        },
      ],
    },
    hooks: {
      'tool:after-call': async (payload, { host }) => {
        const afterCall = readPluginHookPayload<ToolAfterCallHookPayload>(payload);
        const summary = buildToolAuditSummary(afterCall);
        const storageScope = afterCall.source.kind === 'plugin'
          ? afterCall.pluginId ?? afterCall.source.id
          : `${afterCall.source.kind}.${afterCall.source.id}`;

        await persistPluginObservation(
          host,
          `tool.${storageScope}.${afterCall.tool.name}.last-call`,
          summary,
          'info',
          `工具 ${afterCall.source.id}:${afterCall.tool.name} 执行完成`,
          'tool:observed',
        );

        return {
          action: 'pass',
        };
      },
    },
  };
}
