import type { PluginLlmMessage, PluginParamSchema, PluginSubagentRunParams } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import { RuntimeHostSubagentTypeRegistryService } from '../../runtime/host/runtime-host-subagent-type-registry.service';

export interface TaskToolInput {
  description: string;
  sessionId?: string;
  prompt: string;
  subagentType?: string;
}

export interface TaskToolResult {
  description: string;
  modelId: string;
  providerId: string;
  sessionId?: string;
  sessionMessageCount?: number;
  taskId: string;
  text: string;
  subagentType?: string;
}

const TASK_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  description: {
    description: '任务标题，建议 3 到 5 个词。',
    required: true,
    type: 'string',
  },
  prompt: {
    description: '要委派给子代理继续完成的具体任务。',
    required: true,
    type: 'string',
  },
  subagentType: {
    description: '可选子代理类型，未指定时沿用通用类型。',
    required: false,
    type: 'string',
  },
  sessionId: {
    description: '可选已有 session id。传入后会在同一子会话上继续执行。',
    required: false,
    type: 'string',
  },
};

@Injectable()
export class TaskToolService {
  constructor(private readonly runtimeHostSubagentTypeRegistryService: RuntimeHostSubagentTypeRegistryService) {}

  getToolName(): string {
    return 'task';
  }

  buildToolDescription(): string {
    const subagentTypes = this.runtimeHostSubagentTypeRegistryService.listTypes();
    return [
      '把当前问题委派给一个子代理继续处理，并返回子代理结果。',
      '适合把探索、整理、拆分执行这类工作从当前主回复中分离出去。',
      '如果传入已有 sessionId，会沿用同一子会话继续执行。',
      '',
      '可用子代理类型:',
      ...subagentTypes.map((entry) => `- ${entry.id}: ${entry.description ?? entry.name}`),
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return TASK_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>): TaskToolInput {
    const description = typeof args.description === 'string' ? args.description.trim() : '';
    if (!description) {
      throw new BadRequestException('task.description 不能为空');
    }
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
    if (!prompt) {
      throw new BadRequestException('task.prompt 不能为空');
    }
    const subagentType = typeof args.subagentType === 'string' && args.subagentType.trim()
      ? args.subagentType.trim()
      : undefined;
    const sessionId = typeof args.sessionId === 'string' && args.sessionId.trim()
      ? args.sessionId.trim()
      : undefined;
    return {
      description,
      ...(sessionId ? { sessionId } : {}),
      prompt,
      ...(subagentType ? { subagentType } : {}),
    };
  }

  buildSubagentParams(input: TaskToolInput): PluginSubagentRunParams {
    const messages: PluginLlmMessage[] = [{
      content: input.prompt,
      role: 'user',
    }];
    return {
      description: input.description,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.subagentType ? { subagentType: input.subagentType } : {}),
      messages,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => {
    const result = output as TaskToolResult;
    return {
      type: 'text',
      value: [
        `task_id: ${result.taskId}`,
        ...(result.sessionId ? [`session_id: ${result.sessionId}`] : []),
        `<task_result title="${escapeXml(result.description)}">`,
        ...(result.subagentType ? [`subagent_type: ${result.subagentType}`] : []),
        `provider: ${result.providerId}`,
        `model: ${result.modelId}`,
        ...(typeof result.sessionMessageCount === 'number' ? [`session_message_count: ${result.sessionMessageCount}`] : []),
        '',
        result.text,
        '</task_result>',
      ].join('\n'),
    };
  };
}

function escapeXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}
