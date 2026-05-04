import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { HostModule } from '../runtime/host/host.module';
import { AiController } from './ai.controller';

@Module({
  imports: [ConversationModule, HostModule],
  controllers: [AiController],
})
export class AiManagementModule {}
