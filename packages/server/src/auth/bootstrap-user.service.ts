import { Injectable, Logger } from '@nestjs/common';
import { SINGLE_USER_USERNAME } from './single-user-auth';

@Injectable()
export class BootstrapUserService {
  private readonly logger = new Logger(BootstrapUserService.name);
  runStartupWarmup(): void { this.logger.log(`用户已就绪: ${SINGLE_USER_USERNAME}`); }
}
