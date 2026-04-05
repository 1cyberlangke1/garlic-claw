import {
  buildMessageReceivedSummary,
  buildWaitingModelSummary,
  MESSAGE_ENTRY_RECORDER_MANIFEST,
  persistPluginObservation,
  createPassHookResult,
  readPluginHookPayload,
} from '@garlic-claw/plugin-sdk/authoring';
import type {
  ChatWaitingModelHookPayload,
  MessageReceivedHookPayload,
} from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建收到消息 / waiting-model 记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `message:received / chat:waiting-model` 观测 Hook 的内建插件定义
 *
 * 预期行为:
 * - 对命令式消息在进入 LLM 前记录稳定摘要
 * - 在真正进入模型调用前记录 waiting 摘要
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createMessageEntryRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: MESSAGE_ENTRY_RECORDER_MANIFEST,
    hooks: {
      'message:received': async (payload, { host }) => {
        const received = readPluginHookPayload<MessageReceivedHookPayload>(payload);
        const summary = buildMessageReceivedSummary(received);

        await persistPluginObservation(
          host,
          'message.received.last-entry',
          summary,
          'info',
          `会话 ${received.conversationId} 收到一条待处理用户消息`,
          'message:received:observed',
        );

        return createPassHookResult();
      },
      'chat:waiting-model': async (payload, { host }) => {
        const waiting = readPluginHookPayload<ChatWaitingModelHookPayload>(payload);
        const summary = buildWaitingModelSummary(waiting);

        await persistPluginObservation(
          host,
          'message.waiting.last-model-request',
          summary,
          'info',
          `会话 ${waiting.conversationId} 即将进入模型调用`,
          'chat:waiting-model:observed',
        );

        return undefined;
      },
    },
  };
}
