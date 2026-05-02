import { Module } from '@nestjs/common';
import { ServerWorkspaceLifecycleService } from './server-workspace-lifecycle.service';

@Module({
  providers: [ServerWorkspaceLifecycleService],
})
export class RuntimeModule {}
