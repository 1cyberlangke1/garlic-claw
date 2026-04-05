import {
  CRON_HEARTBEAT_MANIFEST,
  readPluginHookPayload,
} from '@garlic-claw/plugin-sdk/authoring';
import type { PluginCronTickPayload } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建默认 cron 心跳插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 可注册到统一 runtime 的内建插件定义
 *
 * 预期行为:
 * - 声明一个默认 cron job
 * - 在每次 tick 时通过统一 Host API 记录计数与最近执行时间
 */
export function createCronHeartbeatPlugin(): BuiltinPluginDefinition {
  return {
    manifest: CRON_HEARTBEAT_MANIFEST,
    hooks: {
      'cron:tick': async (payload, { host }) => {
        const tick = readPluginHookPayload<PluginCronTickPayload>(payload);
        const current = await host.getStorage(`cron.${tick.job.name}.count`);
        const nextCount = typeof current === 'number' ? current + 1 : 1;

        await host.setStorage(`cron.${tick.job.name}.count`, nextCount);
        await host.setStorage(`cron.${tick.job.name}.lastTickAt`, tick.tickedAt);

        return {
          ok: true,
          count: nextCount,
          jobId: tick.job.id,
        };
      },
    },
  };
}
