import {
  buildConversationCreatedSummary,
  buildMessageLifecycleSummary,
  MESSAGE_LIFECYCLE_RECORDER_MANIFEST,
  persistPluginObservation,
  createPassHookResult,
  readPluginHookPayload,
} from '@garlic-claw/plugin-sdk/authoring';
import type {
  ConversationCreatedHookPayload,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageUpdatedHookPayload,
} from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建会话/消息生命周期记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `conversation:* / message:*` 观测 Hook 的内建插件定义
 *
 * 预期行为:
 * - 在会话创建、消息创建/更新/删除后写入最近一次摘要
 * - 同时向宿主事件日志追加统一审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createMessageLifecycleRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: MESSAGE_LIFECYCLE_RECORDER_MANIFEST,
    hooks: {
      'conversation:created': async (payload, { host }) => {
        const created = readPluginHookPayload<ConversationCreatedHookPayload>(payload);
        const summary = buildConversationCreatedSummary(created);

        await persistPluginObservation(
          host,
          `conversation.${created.conversation.id}.last-created`,
          summary,
          'info',
          `会话 ${created.conversation.id} 已创建`,
          'conversation:observed',
        );

        return undefined;
      },
      'message:created': async (payload, { host }) => {
        const created = readPluginHookPayload<MessageCreatedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:created',
          created.conversationId,
          created.message,
          created.context.userId ?? null,
        );

        await persistPluginObservation(
          host,
          `conversation.${created.conversationId}.last-message-created`,
          summary,
          'info',
          `会话 ${created.conversationId} 已创建一条 ${created.message.role} 消息`,
          'message:observed',
        );

        return createPassHookResult();
      },
      'message:updated': async (payload, { host }) => {
        const updated = readPluginHookPayload<MessageUpdatedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:updated',
          updated.conversationId,
          {
            id: updated.messageId,
            ...updated.nextMessage,
          },
          updated.context.userId ?? null,
        );

        await persistPluginObservation(
          host,
          `message.${updated.messageId}.last-updated`,
          summary,
          'info',
          `消息 ${updated.messageId} 已更新`,
          'message:observed',
        );

        return createPassHookResult();
      },
      'message:deleted': async (payload, { host }) => {
        const deleted = readPluginHookPayload<MessageDeletedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:deleted',
          deleted.conversationId,
          {
            id: deleted.messageId,
            ...deleted.message,
          },
          deleted.context.userId ?? null,
        );

        await persistPluginObservation(
          host,
          `message.${deleted.messageId}.last-deleted`,
          summary,
          'info',
          `消息 ${deleted.messageId} 已删除`,
          'message:observed',
        );

        return undefined;
      },
    },
  };
}
