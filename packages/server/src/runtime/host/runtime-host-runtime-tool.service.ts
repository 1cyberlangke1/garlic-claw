import type { JsonObject, PluginCallContext, RuntimeBackendKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ProjectWorktreeSearchOverlayService } from '../../execution/project/project-worktree-search-overlay.service';
import { RuntimeCommandService } from '../../execution/runtime/runtime-command.service';
import { RuntimeFileFreshnessService } from '../../execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import {
  editBuiltinRuntimeFile,
  executeBuiltinRuntimeCommand,
  globBuiltinRuntimePaths,
  grepBuiltinRuntimeContent,
  readBuiltinRuntimePath,
  readBuiltinRuntimeRequiredText,
  writeBuiltinRuntimeFile,
} from '../../plugin/builtin/tools/runtime-tools/runtime-tools-plugin-runtime';

type RuntimeHostBuiltinContext = Parameters<typeof executeBuiltinRuntimeCommand>[0];

@Injectable()
export class RuntimeHostRuntimeToolService {
  constructor(
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
    private readonly runtimeFileFreshnessService: RuntimeFileFreshnessService,
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    @Optional() private readonly projectWorktreeSearchOverlayService?: ProjectWorktreeSearchOverlayService,
  ) {}

  executeCommand(context: PluginCallContext, params: JsonObject) {
    return executeBuiltinRuntimeCommand(this.buildExecutionContext(context), {
      ...(readOptionalRuntimeHostTrimmedString(params.backendKind) ? { backendKind: readRuntimeBackendKind(params.backendKind) } : {}),
      command: readRequiredRuntimeHostString(params, 'command', 'bash.command 不能为空'),
      description: readRequiredRuntimeHostString(params, 'description', 'bash.description 不能为空'),
      ...(readOptionalRuntimeHostTimeout(params.timeout) !== undefined ? { timeout: readOptionalRuntimeHostTimeout(params.timeout) } : {}),
      ...(readOptionalRuntimeHostTrimmedString(params.workdir) ? { workdir: readOptionalRuntimeHostTrimmedString(params.workdir) } : {}),
    });
  }

  readPath(context: PluginCallContext, params: JsonObject) {
    return readBuiltinRuntimePath(this.buildExecutionContext(context), {
      filePath: readRequiredRuntimeHostString(params, 'filePath', 'read.filePath 不能为空'),
      ...(readPositiveRuntimeHostInteger(params.limit, 'read.limit') !== undefined ? { limit: readPositiveRuntimeHostInteger(params.limit, 'read.limit') } : {}),
      ...(readPositiveRuntimeHostInteger(params.offset, 'read.offset') !== undefined ? { offset: readPositiveRuntimeHostInteger(params.offset, 'read.offset') } : {}),
    });
  }

  globPaths(context: PluginCallContext, params: JsonObject) {
    return globBuiltinRuntimePaths(this.buildExecutionContext(context), {
      pattern: readRequiredRuntimeHostString(params, 'pattern', 'glob.pattern 不能为空'),
      ...(readOptionalRuntimeHostTrimmedString(params.path) ? { path: readOptionalRuntimeHostTrimmedString(params.path) } : {}),
    });
  }

  grepContent(context: PluginCallContext, params: JsonObject) {
    return grepBuiltinRuntimeContent(this.buildExecutionContext(context), {
      pattern: readRequiredRuntimeHostString(params, 'pattern', 'grep.pattern 不能为空'),
      ...(readOptionalRuntimeHostTrimmedString(params.include) ? { include: readOptionalRuntimeHostTrimmedString(params.include) } : {}),
      ...(readOptionalRuntimeHostTrimmedString(params.path) ? { path: readOptionalRuntimeHostTrimmedString(params.path) } : {}),
    });
  }

  writeFile(context: PluginCallContext, params: JsonObject) {
    return writeBuiltinRuntimeFile(this.buildExecutionContext(context), {
      content: readBuiltinRuntimeRequiredText(params.content, 'write.content'),
      filePath: readRequiredRuntimeHostString(params, 'filePath', 'write.filePath 不能为空'),
    });
  }

  editFile(context: PluginCallContext, params: JsonObject) {
    const oldString = readBuiltinRuntimeRequiredText(params.oldString, 'edit.oldString');
    const newString = readBuiltinRuntimeRequiredText(params.newString, 'edit.newString');
    if (oldString === newString) {
      throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
    }
    return editBuiltinRuntimeFile(this.buildExecutionContext(context), {
      filePath: readRequiredRuntimeHostString(params, 'filePath', 'edit.filePath 不能为空'),
      newString,
      oldString,
      ...(typeof params.replaceAll === 'boolean' ? { replaceAll: params.replaceAll } : {}),
    });
  }

  private buildExecutionContext(callContext: PluginCallContext): RuntimeHostBuiltinContext {
    return {
      callContext,
      host: {
        runtimeTools: {
          projectWorktreeSearchOverlayService: this.projectWorktreeSearchOverlayService,
          runtimeCommandService: this.runtimeCommandService,
          runtimeBackendRoutingService: {
            getConfiguredFilesystemBackendKind: () => readRuntimeBackendKind(process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND),
            getConfiguredShellBackendKind: () => readRuntimeBackendKind(process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND),
          } as never,
          runtimeFileFreshnessService: this.runtimeFileFreshnessService,
          runtimeFilesystemBackendService: this.runtimeFilesystemBackendService,
          runtimeSessionEnvironmentService: this.runtimeSessionEnvironmentService,
          storedConfig: {},
          runtimeToolBackendService: this.runtimeToolBackendService,
          runtimeToolPermissionService: this.runtimeToolPermissionService,
        },
      } as unknown as RuntimeHostBuiltinContext['host'],
    };
  }
}

function readRequiredRuntimeHostString(params: JsonObject, key: string, errorMessage: string): string {
  const value = readOptionalRuntimeHostTrimmedString(params[key]);
  if (!value) {
    throw new BadRequestException(errorMessage);
  }
  return value;
}

function readOptionalRuntimeHostTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPositiveRuntimeHostInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} 必须是大于 0 的整数`);
  }
  return value;
}

function readOptionalRuntimeHostTimeout(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('bash.timeout 必须是大于 0 的毫秒数');
  }
  return value;
}

function readRuntimeBackendKind(value: unknown): RuntimeBackendKind | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
