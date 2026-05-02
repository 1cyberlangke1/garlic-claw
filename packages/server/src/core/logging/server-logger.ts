import type { EventLogRecord, EventLogSettings, JsonObject } from '@garlic-claw/shared';
import { Logger } from '@nestjs/common';
import { RuntimeEventLogService, type RuntimeEventLogInput, type RuntimeEventLogKind } from './runtime-event-log.service';

type ServerLoggerLevel = 'error' | 'info' | 'warn';

export interface ServerLoggerEventOptions {
  detached?: boolean;
  entityId: string;
  kind: RuntimeEventLogKind;
  metadata?: JsonObject;
  settings?: EventLogSettings | null;
  type: string;
}

export interface ServerLoggerWriteOptions {
  console?: boolean;
  event?: ServerLoggerEventOptions;
  stack?: string;
}

export class ServerLogger {
  private readonly nestLogger: Logger;

  constructor(
    context: string,
    private readonly runtimeEventLogService?: RuntimeEventLogService,
  ) {
    this.nestLogger = new Logger(context);
  }

  info(message: string, options?: ServerLoggerWriteOptions): EventLogRecord | null {
    if (options?.console !== false) {
      this.nestLogger.log(message);
    }
    return this.writeEvent('info', message, options);
  }

  warn(message: string, options?: ServerLoggerWriteOptions): EventLogRecord | null {
    if (options?.console !== false) {
      this.nestLogger.warn(message);
    }
    return this.writeEvent('warn', message, options);
  }

  error(message: string, options?: ServerLoggerWriteOptions): EventLogRecord | null {
    if (options?.console !== false) {
      this.nestLogger.error(message, options?.stack);
    }
    return this.writeEvent('error', message, options);
  }

  private writeEvent(level: ServerLoggerLevel, message: string, options?: ServerLoggerWriteOptions): EventLogRecord | null {
    if (!this.runtimeEventLogService || !options?.event) {
      return null;
    }
    const input: RuntimeEventLogInput = { level, message, metadata: options.event.metadata, type: options.event.type };
    if (options.event.detached && options.event.kind === 'plugin') {
      return this.runtimeEventLogService.appendDetachedPluginAudit(options.event.entityId, options.event.settings, input);
    }
    return this.runtimeEventLogService.appendLog(options.event.kind, options.event.entityId, options.event.settings, input);
  }
}

export function createServerLogger(context: string, runtimeEventLogService?: RuntimeEventLogService): ServerLogger {
  return new ServerLogger(context, runtimeEventLogService);
}
