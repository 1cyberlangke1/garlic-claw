import {
  buildResponseSendSummary,
  persistPluginObservation,
  readPluginHookPayload,
  RESPONSE_RECORDER_MANIFEST,
} from '@garlic-claw/plugin-sdk';
import type { ResponseAfterSendHookPayload } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建回复发送记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `response:after-send` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在最终回复发送后写入最近一次发送摘要
 * - 同时向宿主事件日志追加一条发送审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createResponseRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: RESPONSE_RECORDER_MANIFEST,
    hooks: {
      'response:after-send': async (payload, { host }) => {
        const afterSend = readPluginHookPayload<ResponseAfterSendHookPayload>(payload);
        const summary = buildResponseSendSummary(afterSend);

        await persistPluginObservation(
          host,
          `response.${afterSend.assistantMessageId}.last-sent`,
          summary,
          'info',
          `回复 ${afterSend.assistantMessageId} 已发送 (${afterSend.responseSource})`,
          'response:sent',
        );

        return undefined;
      },
    },
  };
}
