import type { PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';

export function readRuntimeTimeoutMs(
  context: PluginCallContext,
  fallback: number,
): number {
  const raw = context.metadata?.timeoutMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }

  return raw;
}

export function requireRuntimeConversationId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.conversationId) {
    throw new BadRequestException(`${method} 需要 conversationId 上下文`);
  }

  return context.conversationId;
}

export function requireRuntimeUserId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.userId) {
    throw new BadRequestException(`${method} 需要 userId 上下文`);
  }

  return context.userId;
}
