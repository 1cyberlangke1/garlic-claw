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
const WEBFETCH_USER_AGENT = 'garlic-claw-webfetch';

@Injectable()
export class WebFetchService {
  async fetch(input: WebFetchInput): Promise<WebFetchResult> {
    const url = normalizeFetchUrl(input.url);
    const format = input.format ?? 'markdown';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), normalizeTimeoutMs(input.timeout));
    try {
      const response = await fetch(url, {
        headers: buildRequestHeaders(format),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`webfetch 请求失败: ${response.status}`);
      }
      const buffer = await readWebFetchBuffer(response);
      const contentType = normalizeContentType(response.headers.get('content-type'));
      if (!isSupportedContentType(contentType)) {
        throw new Error(`webfetch 暂不支持该内容类型: ${contentType || 'unknown'}`);
      }
      const raw = buffer.toString('utf8');
      return {
        contentType,
        format,
        output: renderFetchOutput(raw, contentType, format),
        status: response.status,
        title: readDocumentTitle(raw) ?? `${url} (${contentType || 'text/plain'})`,
        url,
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
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('webfetch url 不能为空');
  }
  if (!/^https?:\/\//u.test(normalized)) {
    throw new Error('webfetch url 必须以 http:// 或 https:// 开头');
  }
  return normalized;
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

async function readWebFetchBuffer(response: Response): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('webfetch 响应过大，超过 5MB 限制');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('webfetch 响应过大，超过 5MB 限制');
  }
  return buffer;
}

function buildRequestHeaders(format: WebFetchFormat): Record<string, string> {
  return {
    Accept: format === 'html'
      ? 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1'
      : format === 'text'
        ? 'text/plain,text/html;q=0.9,text/markdown;q=0.8,*/*;q=0.1'
        : 'text/markdown,text/plain;q=0.9,text/html;q=0.8,*/*;q=0.1',
    'User-Agent': WEBFETCH_USER_AGENT,
  };
}

function normalizeContentType(value: string | null): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function isSupportedContentType(contentType: string): boolean {
  return !contentType
    || contentType.startsWith('text/')
    || ['application/json', 'application/xml', 'application/xhtml+xml'].includes(contentType);
}

function renderFetchOutput(content: string, contentType: string, format: WebFetchFormat): string {
  if (!contentType.includes('html') && !contentType.includes('xhtml')) {
    return content.trim();
  }
  if (format === 'html') {
    return content.trim();
  }
  return (format === 'text' ? htmlToText(content) : htmlToMarkdown(content)).trim();
}

function readDocumentTitle(content: string): string | null {
  const title = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeHtmlEntities(stripTags(title)).trim() || null : null;
}

function htmlToText(content: string): string {
  return decodeHtmlEntities(normalizeWhitespace(stripTags(
    stripHtmlNoise(content)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|header|footer|main|aside|li|ul|ol|h1|h2|h3|h4|h5|h6|pre|blockquote)>/gi, '\n'),
  )));
}

function htmlToMarkdown(content: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(
    stripHtmlNoise(content)
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_m, code: string) => `\n\`\`\`\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n`)
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, code: string) => `\`${decodeHtmlEntities(stripTags(code)).trim()}\``)
      .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => `[${decodeHtmlEntities(stripTags(text)).trim() || href}](${href})`)
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, text: string) => `\n${'#'.repeat(Number(level))} ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, text: string) => `\n- ${decodeHtmlEntities(stripTags(text)).trim()}`)
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, text: string) => `\n> ${decodeHtmlEntities(stripTags(text)).trim()}\n`)
      .replace(/<(p|div|section|article|header|footer|main|aside)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag: string, text: string) => `\n${decodeHtmlEntities(stripTags(text)).trim()}\n`)
      .replace(/<br\s*\/?>/gi, '\n'),
  )));
}

function stripHtmlNoise(content: string): string {
  return content
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function stripTags(content: string): string {
  return content.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/ ([.,!?;:])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
