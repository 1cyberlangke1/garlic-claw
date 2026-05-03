import { Injectable } from '@nestjs/common';
import { ContextGovernanceService } from './context-governance.service';

@Injectable()
export class ConversationAfterResponseCompactionService {
  constructor(
    private readonly contextGovernanceService: ContextGovernanceService,
  ) {}

  async run(input: {
    conversationId: string;
    modelId: string;
    providerId: string;
    userId?: string;
  }): Promise<boolean> {
    return this.contextGovernanceService.rewriteHistoryAfterCompletedResponse(input);
  }
}
