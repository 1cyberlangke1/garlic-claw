import type { PluginParamSchema } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import type { RuntimeCommandResult } from '../runtime/runtime-command.types';
import { renderRuntimeCommandTextOutput } from '../runtime/runtime-command-output';
import { RuntimeCommandService } from '../runtime/runtime-command.service';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../runtime/runtime-tool-backend.service';

export interface BashToolInput {
  command: string;
  description: string;
  sessionId: string;
  timeout?: number;
  workdir?: string;
}

export const BASH_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  command: {
    description: '要执行的 bash 命令。命令语法必须按 bash 编写，不是 PowerShell。',
    required: true,
    type: 'string',
  },
  description: {
    description: '用 5 到 10 个词描述这条命令在做什么，便于审查和后续理解。',
    required: true,
    type: 'string',
  },
  workdir: {
    description: '可选工作目录。相对路径会基于当前 backend 的可见根解析。优先使用该字段，不要在命令里先写 cd。',
    required: false,
    type: 'string',
  },
  timeout: {
    description: '可选超时时间，单位毫秒，默认 30000，最大 120000。',
    required: false,
    type: 'number',
  },
};

@Injectable()
export class BashToolService {
  constructor(
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
  ) {}

  getToolName(): string {
    return 'bash';
  }

  buildToolDescription(): string {
    const backend = this.runtimeToolBackendService.getShellBackendDescriptor();
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot;
    return [
      '在当前 session 的执行后端中执行 bash 命令。',
      visibleRoot === '/'
        ? '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。'
        : `同一 session 下写入 ${visibleRoot} 内的文件，会在后续工具调用中继续可见。`,
      '不要假设 shell 进程状态会跨调用延续；每次调用都应写成自包含命令。',
      backend.permissionPolicy.networkAccess === 'deny'
        ? '当前执行环境不提供网络访问。'
        : '如需访问网络，请把依赖写进同一条命令中。',
      visibleRoot === '/'
        ? 'workdir 必须位于当前 backend 可见路径内。'
        : `workdir 参数只能位于 ${visibleRoot} 内。`,
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return BASH_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string): BashToolInput {
    if (!sessionId) {
      throw new BadRequestException('bash 工具只能在 session 上下文中使用');
    }
    const description = typeof args.description === 'string' ? args.description.trim() : '';
    if (!description) {
      throw new BadRequestException('bash.description 不能为空');
    }
    const command = typeof args.command === 'string' ? args.command.trim() : '';
    if (!command) {
      throw new BadRequestException('bash.command 不能为空');
    }
    const workdir = typeof args.workdir === 'string' && args.workdir.trim() ? args.workdir.trim() : undefined;
    const timeout = typeof args.timeout === 'number' ? args.timeout : undefined;
    return {
      command,
      description,
      sessionId,
      ...(timeout !== undefined ? { timeout } : {}),
      ...(workdir ? { workdir } : {}),
    };
  }

  async execute(input: BashToolInput): Promise<RuntimeCommandResult> {
    return this.runtimeCommandService.executeCommand({
      ...input,
      backendKind: this.runtimeToolBackendService.getShellBackendKind(),
    });
  }

  readRuntimeAccess(args: Record<string, unknown>, sessionId?: string): RuntimeToolAccessRequest {
    const input = this.readInput(args, sessionId);
    return {
      metadata: {
        command: input.command,
        description: input.description,
        ...(input.workdir ? { workdir: input.workdir } : {}),
      },
      requiredOperations: [
        'command.execute',
        ...(requiresBashNetworkAccess(input.command) ? ['network.access' as const] : []),
      ],
      role: 'shell',
      summary: `${input.description} (${input.workdir ?? this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot})`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => {
    const result = output as RuntimeCommandResult;
    return {
      type: 'text',
      value: renderRuntimeCommandTextOutput(result),
    };
  };
}

function requiresBashNetworkAccess(command: string): boolean {
  return /\b(curl|wget|fetch|nc|telnet|ssh|scp|sftp)\b/u.test(command)
    || /\bgit\s+(clone|fetch|pull)\b/u.test(command)
    || /\b(npm|pnpm|yarn|bun)\s+(install|add)\b/u.test(command);
}
