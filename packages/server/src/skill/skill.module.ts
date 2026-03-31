import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SkillCommandService } from './skill-command.service';
import { SkillController } from './skill.controller';
import {
  SKILL_DISCOVERY_OPTIONS,
  SkillDiscoveryService,
} from './skill-discovery.service';
import { SkillRegistryService } from './skill-registry.service';
import { SkillSessionService } from './skill-session.service';

@Module({
  imports: [AuthModule],
  controllers: [SkillController],
  providers: [
    SkillDiscoveryService,
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    SkillRegistryService,
    SkillSessionService,
    SkillCommandService,
  ],
  exports: [
    SkillRegistryService,
    SkillSessionService,
    SkillCommandService,
  ],
})
export class SkillModule {}
