import type { LanguageModel } from './ai-sdk-stub-core';

/**
 * 通用 SDK 配置。
 */
export interface SdkConfig {
  /** API Key。 */
  apiKey?: string;
  /** 基础 URL。 */
  baseURL?: string;
  /** 自定义 fetch。 */
  fetch?: typeof fetch;
  /** 自定义请求头。 */
  headers?: Record<string, string>;
  /** 协议接入标识。 */
  name?: string;
}

/**
 * 三家官方 SDK 实例最小契约。
 */
export interface SdkInstance {
  /** 直接调用返回模型。 */
  (modelId: string): LanguageModel;
  /** 聊天模型工厂。 */
  chat: (modelId: string) => LanguageModel;
}

/**
 * OpenAI 配置。
 */
export interface OpenAIConfig extends SdkConfig {}

/**
 * OpenAI SDK 实例。
 */
export interface OpenAIInstance extends SdkInstance {}

/**
 * Anthropic 配置。
 */
export interface AnthropicConfig extends SdkConfig {}

/**
 * Anthropic SDK 实例。
 */
export interface AnthropicInstance extends SdkInstance {}

/**
 * Google 配置。
 */
export interface GoogleConfig extends SdkConfig {}

/**
 * Google SDK 实例。
 */
export interface GoogleInstance extends SdkInstance {}

/**
 * 创建 OpenAI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createOpenAI(_config: OpenAIConfig): OpenAIInstance {
  throw new Error('createOpenAI is a type-check stub only');
}

/**
 * 创建 Anthropic SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createAnthropic(_config: AnthropicConfig): AnthropicInstance {
  throw new Error('createAnthropic is a type-check stub only');
}

/**
 * 创建 Google Generative AI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createGoogleGenerativeAI(
  _config: GoogleConfig,
): GoogleInstance {
  throw new Error('createGoogleGenerativeAI is a type-check stub only');
}
