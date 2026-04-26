import type { JsonObject, PluginParamSchema, RuntimeBackendKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import type { RuntimeCommandResult } from '../runtime/runtime-command.types';
import { renderRuntimeCommandTextOutput } from '../runtime/runtime-command-output';
import { readRuntimeShellCommandHints, usesRuntimePowerShellSyntax } from '../runtime/runtime-shell-command-hints';
import { RuntimeCommandService } from '../runtime/runtime-command.service';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../runtime/runtime-tool-backend.service';

export interface BashToolInput { backendKind: RuntimeBackendKind; command: string; description: string; sessionId: string; timeout?: number; workdir?: string; }

export const BASH_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  command: { description: '要执行的命令。命令语法跟随当前 shell backend：bash / WSL 使用 bash，Windows PowerShell backend 使用 PowerShell。', required: true, type: 'string' },
  description: { description: '用 5 到 10 个词描述这条命令在做什么，便于审查和后续理解。', required: true, type: 'string' },
  workdir: { description: '可选工作目录。相对路径会基于当前 backend 的可见根解析。优先使用该字段，不要在命令里先写 cd。', required: false, type: 'string' },
  timeout: { description: '可选超时时间，单位毫秒，默认 30000，最大 120000。', required: false, type: 'number' },
};

@Injectable()
export class BashToolService {
  constructor(
    private readonly runtimeCommandService: RuntimeCommandService,
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
  ) {}

  getToolName(): string { return 'bash'; }
  getToolParameters(): Record<string, PluginParamSchema> { return BASH_TOOL_PARAMETERS; }
  async execute(input: BashToolInput): Promise<RuntimeCommandResult> { return this.runtimeCommandService.executeCommand(input); }

  buildToolDescription(): string {
    const backend = this.runtimeToolBackendService.getShellBackendDescriptor(), visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot, visibleRootDescription = visibleRoot === '/' ? '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。' : `同一 session 下写入 ${visibleRoot} 内的文件，会在后续工具调用中继续可见。`;
    return [
      '在当前 session 的执行后端中执行命令。',
      usesRuntimePowerShellSyntax(backend.kind) ? '当前 shell backend 使用 PowerShell 语法。' : '当前 shell backend 使用 bash 语法。',
      usesRuntimePowerShellSyntax(backend.kind) ? '如果后续命令依赖前序命令成功，不要使用 &&；请改用 PowerShell 条件写法，例如 cmd1; if ($?) { cmd2 }。' : '如果后续命令依赖前序命令成功，请把它们放进同一条命令，并用 && 串起来。',
      visibleRootDescription,
      '当前后端不会保留 shell 进程状态；不要依赖 cd、export、alias 或 shell function 在跨调用时继续存在。',
      '优先使用 workdir 指定目录，不要把 cd 写进命令里。',
      '读取、搜索或编辑文件时优先使用 read / glob / grep / write / edit，不要用 bash 代替。',
      readBashNetworkPolicyDescription(backend.permissionPolicy.networkAccess),
      visibleRoot === '/' ? 'workdir 必须位于当前 backend 可见路径内。' : `workdir 参数只能位于 ${visibleRoot} 内。`,
    ].join('\n');
  }

  readInput(args: Record<string, unknown>, sessionId?: string, backendKind?: RuntimeBackendKind): BashToolInput {
    if (!sessionId) {throw new BadRequestException('bash 工具只能在 session 上下文中使用');}
    const description = typeof args.description === 'string' ? args.description.trim() : '', command = typeof args.command === 'string' ? args.command.trim() : '';
    if (!description) {throw new BadRequestException('bash.description 不能为空');}
    if (!command) {throw new BadRequestException('bash.command 不能为空');}
    const workdir = typeof args.workdir === 'string' && args.workdir.trim() ? args.workdir.trim() : undefined, timeout = typeof args.timeout === 'number' ? args.timeout : undefined;
    return { backendKind: backendKind ?? this.runtimeToolBackendService.getShellBackendKind(), command, description, sessionId, ...(timeout !== undefined ? { timeout } : {}), ...(workdir ? { workdir } : {}) };
  }

  async readRuntimeAccess(input: BashToolInput): Promise<RuntimeToolAccessRequest> {
    const visibleRoot = this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot, commandHints = await readRuntimeShellCommandHints({ backendKind: input.backendKind, command: input.command, visibleRoot, ...(input.workdir ? { workdir: input.workdir } : {}) });
    const metadata: JsonObject = { command: input.command, description: input.description, ...(input.workdir ? { workdir: input.workdir } : {}), ...(commandHints.metadata ? { commandHints: commandHints.metadata as unknown as JsonObject } : {}) };
    return { backendKind: input.backendKind, metadata, requiredOperations: ['command.execute', ...(commandHints.metadata?.usesNetworkCommand ? ['network.access' as const] : [])], role: 'shell', summary: [`${input.description} (${input.workdir ?? visibleRoot})`, ...(commandHints.summary ? [commandHints.summary] : [])].join('；') };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({ type: 'text', value: renderRuntimeCommandTextOutput(output as RuntimeCommandResult) });
}

function readBashNetworkPolicyDescription(policy: 'allow' | 'ask' | 'deny'): string {
  return policy === 'deny' ? '当前执行环境不提供网络访问。' : policy === 'ask' ? '当前执行环境的网络访问可能需要审批；如需联网，请把依赖写进同一条命令中。' : '当前执行环境允许网络访问；如需联网，请把依赖写进同一条命令中。';
}
