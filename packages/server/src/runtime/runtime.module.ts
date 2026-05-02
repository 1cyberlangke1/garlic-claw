import { Module } from '@nestjs/common';
import { ServerWorkspaceLifecycleService } from '../core/runtime/server-workspace-lifecycle.service';

@Module({
  providers: [ServerWorkspaceLifecycleService],
})
export class RuntimeModule {}
