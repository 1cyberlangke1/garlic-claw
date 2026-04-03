import {
  buildToolAuditStorageKey,
  buildToolAuditSummary,
  createPassHookResult,
  persistPluginObservation,
  readPluginHookPayload,
  TOOL_AUDIT_MANIFEST,
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
    manifest: TOOL_AUDIT_MANIFEST,
    hooks: {
      'tool:after-call': async (payload, { host }) => {
        const afterCall = readPluginHookPayload<ToolAfterCallHookPayload>(payload);
        const summary = buildToolAuditSummary(afterCall);

        await persistPluginObservation(
          host,
          buildToolAuditStorageKey(afterCall),
          summary,
          'info',
          `工具 ${afterCall.source.id}:${afterCall.tool.name} 执行完成`,
          'tool:observed',
        );

        return createPassHookResult();
      },
    },
  };
}
