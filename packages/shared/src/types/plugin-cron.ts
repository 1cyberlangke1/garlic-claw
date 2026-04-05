import type { JsonValue } from './json';

/** 插件声明的 cron 来源。 */
export type PluginCronSource = 'manifest' | 'host';

/** 插件声明的 cron 描述。 */
export interface PluginCronDescriptor {
  name: string;
  cron: string;
  description?: string;
  enabled?: boolean;
  data?: JsonValue;
}

/** 插件 cron job 摘要。 */
export interface PluginCronJobSummary {
  id: string;
  pluginId: string;
  name: string;
  cron: string;
  description?: string;
  source: PluginCronSource;
  enabled: boolean;
  data?: JsonValue;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** cron 定时触发时的 Hook 输入。 */
export interface PluginCronTickPayload {
  job: PluginCronJobSummary;
  tickedAt: string;
}
