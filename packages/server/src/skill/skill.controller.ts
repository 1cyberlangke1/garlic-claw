import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { SkillDetail } from '@garlic-claw/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkillRegistryService } from './skill-registry.service';

@ApiTags('Skills')
@ApiBearerAuth()
@Controller('skills')
@UseGuards(JwtAuthGuard)
export class SkillController {
  constructor(
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  @Get()
  listSkills(): Promise<SkillDetail[]> {
    return this.skillRegistry.listSkills();
  }

  @Post('refresh')
  refreshSkills(): Promise<SkillDetail[]> {
    return this.skillRegistry.refreshSkills();
  }
}
