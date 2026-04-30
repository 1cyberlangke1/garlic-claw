import type { PluginParamSchema } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { WebFetchResult } from './webfetch-service';
import { WebFetchService } from './webfetch-service';

const WEBFETCH_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  url: {
    description: '要抓取的 http 或 https 地址。',
    required: true,
    type: 'string',
  },
  format: {
    description: '返回格式，可选 text / markdown / html，默认 markdown。',
    required: false,
    type: 'string',
  },
  timeout: {
    description: '可选超时时间，单位秒，最大 120。',
    required: false,
    type: 'number',
  },
};

@Injectable()
export class WebFetchToolService {
  constructor(private readonly webFetchService: WebFetchService) {}

  getToolName(): string {
    return 'webfetch';
  }

  buildToolDescription(): string {
    return [
      '抓取远端页面或文本资源，并把内容转换成稳定文本返回。',
      '默认输出 markdown，可选 text 或 html。',
      '只支持 http / https。',
      '当前大小限制为 5MB，默认超时 30 秒。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return WEBFETCH_TOOL_PARAMETERS;
  }

  async fetch(input: {
    url: string;
    format?: 'text' | 'markdown' | 'html';
    timeout?: number;
  }): Promise<WebFetchResult> {
    return this.webFetchService.fetch(input);
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({
    type: 'text',
    value: renderWebFetchModelOutput(output as WebFetchResult),
  });
}

function renderWebFetchModelOutput(result: WebFetchResult): string {
  return [
    '<webfetch_result>',
    `URL: ${result.url}`,
    `Title: ${result.title}`,
    `Status: ${result.status}`,
    `Content-Type: ${result.contentType || 'unknown'}`,
    `Format: ${result.format}`,
    '',
    result.output,
    '</webfetch_result>',
  ].join('\n');
}
