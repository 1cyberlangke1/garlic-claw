import type {
  PluginEventLevel,
  PluginHealthSnapshot,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject } from '../common/types/json-value';
import { PrismaService } from '../prisma/prisma.service';

export interface ListPluginEventOptions {
  limit?: number;
  level?: PluginEventLevel;
  type?: string;
  keyword?: string;
  cursor?: string;
}

export type NormalizedPluginEventOptions =
  Required<Pick<ListPluginEventOptions, 'limit'>>
  & Omit<ListPluginEventOptions, 'limit'>;

export function buildPluginHealthSnapshot(input: {
  plugin: {
    status: string;
    healthStatus: string | null;
    failureCount: number;
    consecutiveFailures: number;
    lastError: string | null;
    lastErrorAt: Date | null;
    lastSuccessAt: Date | null;
    lastCheckedAt: Date | null;
  };
}): PluginHealthSnapshot {
  return {
    status: input.plugin.status === 'offline'
      ? 'offline'
      : parsePluginHealthStatus(input.plugin.healthStatus),
    failureCount: input.plugin.failureCount,
    consecutiveFailures: input.plugin.consecutiveFailures,
    lastError: input.plugin.lastError,
    lastErrorAt: input.plugin.lastErrorAt?.toISOString() ?? null,
    lastSuccessAt: input.plugin.lastSuccessAt?.toISOString() ?? null,
    lastCheckedAt: input.plugin.lastCheckedAt?.toISOString() ?? null,
  };
}

export function normalizePluginEventOptions(
  options: ListPluginEventOptions,
): NormalizedPluginEventOptions {
  const limit = Math.min(200, Math.max(1, options.limit ?? 20));

  return {
    limit,
    ...(options.level ? { level: options.level } : {}),
    ...(options.type?.trim() ? { type: options.type.trim() } : {}),
    ...(options.keyword?.trim() ? { keyword: options.keyword.trim() } : {}),
    ...(options.cursor?.trim() ? { cursor: options.cursor.trim() } : {}),
  };
}

export async function resolvePluginEventCursor(input: {
  prisma: PrismaService;
  pluginId: string;
  cursor: string;
}): Promise<{ id: string; createdAt: Date }> {
  const event = await input.prisma.pluginEvent.findUnique({
    where: {
      id: input.cursor,
    },
  });
  if (!event || event.pluginId !== input.pluginId) {
    throw new BadRequestException('无效的事件游标');
  }

  return {
    id: event.id,
    createdAt: event.createdAt,
  };
}

export function buildPluginEventWhere(input: {
  pluginId: string;
  options: NormalizedPluginEventOptions;
  cursorEvent: { id: string; createdAt: Date } | null;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {
    pluginId: input.pluginId,
  };

  if (input.options.level) {
    where.level = input.options.level;
  }
  if (input.options.type) {
    where.type = input.options.type;
  }
  if (input.options.keyword) {
    where.OR = [
      {
        type: {
          contains: input.options.keyword,
        },
      },
      {
        message: {
          contains: input.options.keyword,
        },
      },
      {
        metadataJson: {
          contains: input.options.keyword,
        },
      },
    ];
  }
  if (input.cursorEvent) {
    where.AND = [
      {
        OR: [
          {
            createdAt: {
              lt: input.cursorEvent.createdAt,
            },
          },
          {
            createdAt: input.cursorEvent.createdAt,
            id: {
              lt: input.cursorEvent.id,
            },
          },
        ],
      },
    ];
  }

  return where;
}

export function parsePluginEventLevel(raw: string): PluginEventLevel {
  switch (raw) {
    case 'warn':
    case 'error':
      return raw;
    default:
      return 'info';
  }
}

export function parsePluginHealthStatus(
  raw: string | null,
): PluginHealthSnapshot['status'] {
  switch (raw) {
    case 'healthy':
    case 'degraded':
    case 'error':
    case 'offline':
      return raw;
    default:
      return 'unknown';
  }
}

export async function createPluginEvent(input: {
  prisma: PrismaService;
  pluginId: string;
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
}): Promise<void> {
  await input.prisma.pluginEvent.create({
    data: {
      pluginId: input.pluginId,
      type: input.type,
      level: input.level,
      message: input.message,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
