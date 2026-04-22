import { Module } from '@nestjs/common';
import { McpConfigStoreService } from '../mcp/mcp-config-store.service';
import { PersonaStoreService } from '../../persona/persona-store.service';
import { RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS } from '../runtime/runtime-filesystem-post-write.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService } from '../skill/skill-registry.service';
import { ProjectWorktreeFileService } from './project-worktree-file.service';
import { ProjectWorktreePostWriteService } from './project-worktree-post-write.service';
import { ProjectSubagentTypeRegistryService } from './project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from './project-worktree-root.service';

@Module({
  providers: [
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    {
      provide: RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS,
      useFactory: (projectWorktreePostWriteService: ProjectWorktreePostWriteService) => [projectWorktreePostWriteService],
      inject: [ProjectWorktreePostWriteService],
    },
    McpConfigStoreService,
    PersonaStoreService,
    ProjectWorktreeRootService,
    ProjectWorktreeFileService,
    ProjectWorktreePostWriteService,
    ProjectSubagentTypeRegistryService,
    SkillRegistryService,
  ],
  exports: [
    RUNTIME_FILESYSTEM_POST_WRITE_PROVIDERS,
    McpConfigStoreService,
    PersonaStoreService,
    ProjectWorktreeRootService,
    ProjectWorktreeFileService,
    ProjectWorktreePostWriteService,
    ProjectSubagentTypeRegistryService,
    SkillRegistryService,
  ],
})
export class ProjectWorktreeOverlayModule {}
