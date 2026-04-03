import type { PluginCallContext, PluginScopedStateScope } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject } from '../common/types/json-value';

const SCOPED_STATE_PREFIX = '__gc_scope__:';

export interface ResolvedPluginScopedStateTarget {
  scope: PluginScopedStateScope;
  prefix: string;
}

export function resolvePluginScopedStateTarget(input: {
  context: PluginCallContext;
  params: JsonObject;
  method: string;
}): ResolvedPluginScopedStateTarget {
  const rawScope = readOptionalScope(input.params.scope);
  const scope = rawScope ?? 'plugin';

  switch (scope) {
    case 'plugin':
      return {
        scope,
        prefix: '',
      };
    case 'conversation': {
      const conversationId = input.context.conversationId;
      if (!conversationId) {
        throw new BadRequestException(`${input.method} 需要 conversationId 上下文`);
      }

      return {
        scope,
        prefix: `${SCOPED_STATE_PREFIX}conversation:${conversationId}:`,
      };
    }
    case 'user': {
      const userId = input.context.userId;
      if (!userId) {
        throw new BadRequestException(`${input.method} 需要 userId 上下文`);
      }

      return {
        scope,
        prefix: `${SCOPED_STATE_PREFIX}user:${userId}:`,
      };
    }
    default:
      throw new BadRequestException('scope 必须是 plugin/conversation/user');
  }
}

export function buildPluginScopedStateKey(
  target: ResolvedPluginScopedStateTarget,
  key: string,
): string {
  if (!key.trim()) {
    throw new BadRequestException('key 必填');
  }

  return `${target.prefix}${key}`;
}

export function buildPluginScopedStatePrefix(
  target: ResolvedPluginScopedStateTarget,
  prefix?: string | null,
): string | undefined {
  if (target.scope === 'plugin') {
    return prefix?.trim() ? prefix : undefined;
  }

  return `${target.prefix}${prefix ?? ''}`;
}

export function stripPluginScopedStatePrefix(
  target: ResolvedPluginScopedStateTarget,
  storedKey: string,
): string | null {
  if (target.scope === 'plugin') {
    return storedKey.startsWith(SCOPED_STATE_PREFIX) ? null : storedKey;
  }

  return storedKey.startsWith(target.prefix)
    ? storedKey.slice(target.prefix.length)
    : null;
}

function readOptionalScope(value: unknown): PluginScopedStateScope | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('scope 必须是字符串');
  }

  return value as PluginScopedStateScope;
}
