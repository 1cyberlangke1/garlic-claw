import type { SkillTrustLevel } from '@garlic-claw/shared';
import { IsIn, IsOptional } from 'class-validator';

export class UpdateSkillGovernanceDto {
  @IsIn(['prompt-only', 'asset-read', 'local-script'])
  @IsOptional()
  trustLevel?: SkillTrustLevel;
}
