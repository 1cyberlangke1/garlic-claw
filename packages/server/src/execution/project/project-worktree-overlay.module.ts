import { Module } from '@nestjs/common';
import { McpConfigStoreService } from '../mcp/mcp-config-store.service';
import { PersonaStoreService } from '../../persona/persona-store.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService } from '../skill/skill-registry.service';
import { ProjectWorktreeFileService } from './project-worktree-file.service';
import { ProjectSubagentTypeRegistryService } from './project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from './project-worktree-root.service';

@Module({
  providers: [
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    McpConfigStoreService,
    PersonaStoreService,
    ProjectWorktreeRootService,
    ProjectWorktreeFileService,
    ProjectSubagentTypeRegistryService,
    SkillRegistryService,
  ],
  exports: [
    McpConfigStoreService,
    PersonaStoreService,
    ProjectWorktreeRootService,
    ProjectWorktreeFileService,
    ProjectSubagentTypeRegistryService,
    SkillRegistryService,
  ],
})
export class ProjectWorktreeOverlayModule {}
