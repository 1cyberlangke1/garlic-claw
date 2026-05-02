import { Module } from '@nestjs/common';
import { RuntimeEventLogService } from './runtime-event-log.service';

@Module({
  providers: [RuntimeEventLogService],
  exports: [RuntimeEventLogService],
})
export class CoreLoggingModule {}
