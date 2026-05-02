import type { PluginParamSchema } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import {
  createInvalidToolResult,
  type InvalidToolPayload,
  type InvalidToolResult,
} from './invalid-tool-result';

const INVALID_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  error: {
    description: '错误信息。',
    required: true,
    type: 'string',
  },
  inputText: {
    description: '原始输入文本。',
    type: 'string',
  },
  phase: {
    description: '失败阶段：resolve | validate | execute。',
    required: true,
    type: 'string',
  },
  tool: {
    description: '原始工具名。',
    required: true,
    type: 'string',
  },
};

@Injectable()
export class InvalidToolService {
  getToolName(): string {
    return 'invalid';
  }

  buildToolDescription(): string {
    return [
      '内部恢复工具，不要主动调用。',
      '仅在上一个工具不存在、参数不合法或执行失败时由系统自动使用。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return INVALID_TOOL_PARAMETERS;
  }

  execute(input: InvalidToolPayload): InvalidToolResult {
    return createInvalidToolResult(input);
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => {
    const result = output as InvalidToolResult;
    return {
      type: 'text',
      value: [
        '<invalid_tool_result>',
        '上一个工具调用无效或执行失败，请根据错误修正参数、改用其他工具，或直接继续回答。',
        `<tool>${result.tool}</tool>`,
        `<phase>${result.phase}</phase>`,
        `<error>${escapeInvalidToolText(result.error)}</error>`,
        ...(result.inputText
          ? [
              '<input>',
              escapeInvalidToolText(result.inputText),
              '</input>',
            ]
          : []),
        '</invalid_tool_result>',
      ].join('\n'),
    };
  };
}

function escapeInvalidToolText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
