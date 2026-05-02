import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  deleteServerLegacyPackageTmpRoot,
} from './server-workspace-paths';

@Injectable()
export class ServerWorkspaceLifecycleService implements OnModuleInit {
  onModuleInit(): void {
    if (process.env.JEST_WORKER_ID) {
      return;
    }
    deleteServerLegacyPackageTmpRoot();
  }
}
