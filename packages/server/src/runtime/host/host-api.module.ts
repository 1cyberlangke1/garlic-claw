import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { HostModule } from './host.module';
import { MemoryController } from './memory.controller';

@Module({
  imports: [AuthModule, HostModule],
  controllers: [MemoryController],
})
export class HostApiModule {}
