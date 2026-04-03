import type { ProviderProtocolDriver } from './provider-catalog';

/**
 * 协议族元数据。
 */
export interface ProviderProtocolMetadata {
  /** SDK 包名。 */
  npm: string;
  /** 发现模型时使用的认证头构建器。 */
  buildHeaders: (apiKey: string) => Record<string, string>;
}

/**
 * 根据协议族构造远程请求头。
 * @param protocol 协议族
 * @param apiKey API Key
 * @returns 对应请求头
 */
export function buildProviderProtocolHeaders(
  protocol: ProviderProtocolDriver,
  apiKey: string,
): Record<string, string> {
  switch (protocol) {
    case 'anthropic':
      return {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    case 'gemini':
      return {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      };
    case 'openai':
    default:
      return {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      };
  }
}

/**
 * 获取协议族元数据。
 * @param protocol 协议族
 * @returns SDK 元数据
 */
export function getProviderProtocolMetadata(
  protocol: ProviderProtocolDriver,
): ProviderProtocolMetadata {
  return {
    npm: getProviderProtocolNpm(protocol),
    buildHeaders: (apiKey: string) => buildProviderProtocolHeaders(protocol, apiKey),
  };
}

/**
 * 获取协议族对应的 SDK 包名。
 * @param protocol 协议族
 * @returns SDK 包名
 */
export function getProviderProtocolNpm(
  protocol: ProviderProtocolDriver,
): string {
  switch (protocol) {
    case 'anthropic':
      return '@ai-sdk/anthropic';
    case 'gemini':
      return '@ai-sdk/google';
    case 'openai':
    default:
      return '@ai-sdk/openai';
  }
}
