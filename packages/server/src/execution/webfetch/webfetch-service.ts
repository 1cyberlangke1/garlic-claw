import { Injectable } from '@nestjs/common';

export type WebFetchFormat = 'text' | 'markdown' | 'html';

export interface WebFetchInput {
  url: string;
  format?: WebFetchFormat;
  timeout?: number;
}

export interface WebFetchResult {
  contentType: string;
  format: WebFetchFormat;
  output: string;
  status: number;
  title: string;
  url: string;
}

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class WebFetchService {
  /**
   * 抓取远端页面并按指定格式返回正文。
   */
  async fetch(input: WebFetchInput): Promise<WebFetchResult> {
    const targetUrl = normalizeFetchUrl(input.url);
    const format = input.format ?? 'markdown';
    const timeoutMs = normalizeTimeoutMs(input.timeout);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        headers: buildRequestHeaders(format),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`webfetch 请求失败: ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        throw new Error('webfetch 响应过大，超过 5MB 限制');
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error('webfetch 响应过大，超过 5MB 限制');
      }

      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!isSupportedContentType(contentType)) {
        throw new Error(`webfetch 暂不支持该内容类型: ${contentType || 'unknown'}`);
      }

      const rawContent = buffer.toString('utf8');
      const title = readDocumentTitle(rawContent) ?? `${targetUrl} (${contentType || 'text/plain'})`;

      return {
        contentType,
        format,
        output: renderFetchOutput(rawContent, contentType, format),
        status: response.status,
        title,
        url: targetUrl,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('webfetch 请求超时', { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizeFetchUrl(value: string): string {
  const next = value.trim();
  if (!next) {
    throw new Error('webfetch url 不能为空');
  }
  if (!next.startsWith('http://') && !next.startsWith('https://')) {
    throw new Error('webfetch url 必须以 http:// 或 https:// 开头');
  }
  return next;
}

function normalizeTimeoutMs(timeout?: number): number {
  if (timeout === undefined) {
    return DEFAULT_TIMEOUT_SECONDS * 1000;
  }
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`非法的 webfetch timeout: ${timeout}`);
  }
  return Math.min(Math.floor(timeout), MAX_TIMEOUT_SECONDS) * 1000;
}

function buildRequestHeaders(format: WebFetchFormat): Record<string, string> {
  if (format === 'html') {
    return {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1',
      'User-Agent': 'garlic-claw-webfetch',
    };
  }
  if (format === 'text') {
    return {
      Accept: 'text/plain,text/html;q=0.9,text/markdown;q=0.8,*/*;q=0.1',
      'User-Agent': 'garlic-claw-webfetch',
    };
  }
  return {
    Accept: 'text/markdown,text/plain;q=0.9,text/html;q=0.8,*/*;q=0.1',
    'User-Agent': 'garlic-claw-webfetch',
  };
}

function normalizeContentType(value: string | null): string {
  return (value ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

function isSupportedContentType(contentType: string): boolean {
  return !contentType
    || contentType.startsWith('text/')
    || contentType === 'application/json'
    || contentType === 'application/xml'
    || contentType === 'application/xhtml+xml';
}

function renderFetchOutput(content: string, contentType: string, format: WebFetchFormat): string {
  if (!isHtmlContent(contentType)) {
    return content.trim();
  }
  if (format === 'html') {
    return content.trim();
  }
  if (format === 'text') {
    return htmlToText(content);
  }
  return htmlToMarkdown(content);
}

function isHtmlContent(contentType: string): boolean {
  return contentType.includes('html') || contentType.includes('xhtml');
}

function readDocumentTitle(content: string): string | null {
  const match = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }
  const title = decodeHtmlEntities(stripTags(match[1])).trim();
  return title || null;
}

function htmlToText(content: string): string {
  const normalized = normalizeHtmlWhitespace(
    stripTags(
      content
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|header|footer|main|aside|li|ul|ol|h1|h2|h3|h4|h5|h6|pre|blockquote)>/gi, '\n'),
    ),
  );
  return decodeHtmlEntities(normalized).trim();
}

function htmlToMarkdown(content: string): string {
  let next = content
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code: string) => `\n\`\`\`\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code: string) => `\`${decodeHtmlEntities(stripTags(code)).trim()}\``)
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => `[${decodeHtmlEntities(stripTags(text)).trim() || href}](${href})`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, text: string) => `\n# ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, text: string) => `\n## ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, text: string) => `\n### ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, text: string) => `\n#### ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, text: string) => `\n##### ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, text: string) => `\n###### ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text: string) => `\n- ${decodeHtmlEntities(stripTags(text)).trim()}`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text: string) => `\n> ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<(p|div|section|article|header|footer|main|aside)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag: string, text: string) => `\n${decodeHtmlEntities(stripTags(text)).trim()}\n`)
    .replace(/<br\s*\/?>/gi, '\n');

  next = decodeHtmlEntities(stripTags(next));
  return normalizeMarkdownWhitespace(next).trim();
}

function stripTags(content: string): string {
  return content.replace(/<[^>]+>/g, ' ');
}

function normalizeHtmlWhitespace(content: string): string {
  return content
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/ ([.,!?;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeMarkdownWhitespace(content: string): string {
  return content
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ ([.,!?;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}

function decodeHtmlEntities(content: string): string {
  return content
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'');
}
