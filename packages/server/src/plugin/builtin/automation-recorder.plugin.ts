import {
  AUTOMATION_RECORDER_MANIFEST,
  buildAutomationRunSummary,
  persistPluginObservation,
  createPassHookResult,
  readPluginHookPayload,
} from '@garlic-claw/plugin-sdk/authoring';
import type { AutomationAfterRunHookPayload } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建自动化执行记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `automation:after-run` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在自动化完成后写入最近一次执行摘要
 * - 同时向宿主事件日志追加一条审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createAutomationRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: AUTOMATION_RECORDER_MANIFEST,
    hooks: {
      'automation:after-run': async (payload, { host }) => {
        const afterRun = readPluginHookPayload<AutomationAfterRunHookPayload>(payload);
        const summary = buildAutomationRunSummary(afterRun);

        await persistPluginObservation(
          host,
          `automation.${afterRun.automation.id}.last-run`,
          summary,
          summary.status === 'success' ? 'info' : 'warn',
          `自动化 ${summary.automationName} 执行完成：${summary.status}`,
          'automation:observed',
        );

        return createPassHookResult();
      },
    },
  };
}
