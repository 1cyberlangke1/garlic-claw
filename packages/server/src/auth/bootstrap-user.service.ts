import { Injectable } from '@nestjs/common';
import { createServerLogger } from '../core/logging/server-logger';
import { SINGLE_USER_USERNAME } from './single-user-auth';

@Injectable()
export class BootstrapUserService {
  private readonly logger = createServerLogger(BootstrapUserService.name);
  runStartupWarmup(): void { this.logger.info(`用户已就绪: ${SINGLE_USER_USERNAME}`); }
}
