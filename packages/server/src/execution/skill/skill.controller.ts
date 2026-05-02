import type { EventLogListResult, SkillDetail, UpdateSkillGovernancePayload } from '@garlic-claw/shared';
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';
import { normalizeEventLogSettings } from '../../core/logging/runtime-event-log.service';
import { readPluginEventQuery } from '../../shared/http/http-request.codec';

interface UpdateSkillGovernanceDto {
  loadPolicy?: 'allow' | 'ask' | 'deny';
  eventLog?: {
    maxFileSizeMb?: number;
  };
}

interface SkillEventQueryInput {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}

@Controller('skills')
export class SkillController {
  constructor(
    private readonly skillRegistryService: SkillRegistryService,
  ) {}

  @Get()
  listSkills(): Promise<SkillDetail[]> {
    return this.skillRegistryService.listSkills();
  }

  @Post('refresh')
  async refreshSkills(): Promise<SkillDetail[]> {
    const skills = await this.skillRegistryService.listSkills({ refresh: true });
    return skills;
  }

  @Put(':skillId/governance')
  updateSkillGovernance(
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillGovernanceDto,
  ): Promise<SkillDetail> {
    const payload: UpdateSkillGovernancePayload = {
      ...(dto.loadPolicy ? { loadPolicy: dto.loadPolicy } : {}),
      ...(dto.eventLog ? {
        eventLog: normalizeEventLogSettings({
          maxFileSizeMb: dto.eventLog.maxFileSizeMb ?? 1,
        }),
      } : {}),
    };
    return this.skillRegistryService.updateSkillGovernance(decodeURIComponent(skillId), payload);
  }

  @Get(':skillId/events')
  listSkillEvents(
    @Param('skillId') skillId: string,
    @Query() query?: SkillEventQueryInput,
  ): Promise<EventLogListResult> {
    return this.skillRegistryService.listSkillEvents(
      decodeURIComponent(skillId),
      readPluginEventQuery(query ?? {}),
    );
  }
}
