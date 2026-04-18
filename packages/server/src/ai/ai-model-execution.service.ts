import type { JsonObject, JsonValue, PluginLlmMessage, PluginLlmTransportMode } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type LanguageModel, type ModelMessage, type Tool } from 'ai';
import { createRequire } from 'node:module';
import { AiProviderSettingsService } from '../ai-management/ai-provider-settings.service';
import type { StoredAiProviderConfig } from '../ai-management/ai-management.types';
import { readAssistantRawCustomBlocks, readAssistantResponseCustomBlocks, type AssistantCustomBlockEntry } from '../runtime/host/runtime-host-values';

export interface AiModelExecutionRequest {
  allowFallbackChatModels?: boolean;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  messages: PluginLlmMessage[];
  modelId?: string;
  providerId?: string;
  providerOptions?: JsonObject;
  system?: string;
  transportMode?: PluginLlmTransportMode;
  variant?: string;
}

export interface AiModelExecutionResult {
  customBlocks?: AssistantCustomBlockEntry[];
  customBlockOrigin?: 'ai-sdk.raw' | 'ai-sdk.response-body';
  finishReason?: string | null;
  modelId: string;
  providerId: string;
  text: string;
  usage?: JsonValue;
}

interface AiExecutionTarget {
  modelId: string;
  provider: StoredAiProviderConfig;
}

export interface AiModelExecutionStreamResult { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; modelId: string; providerId: string; }

const localRequire = createRequire(__filename);

@Injectable()
export class AiModelExecutionService {
  constructor(private readonly aiProviderSettingsService: AiProviderSettingsService = new AiProviderSettingsService()) {}

  async generateText(input: AiModelExecutionRequest): Promise<AiModelExecutionResult> {
    if (input.transportMode === 'stream-collect') {
      return this.collectStreamedTextResult(input);
    }
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = await generateText(this.buildExecutionInput(input, target) as Parameters<typeof generateText>[0]);
        return {
          ...(result.response?.body
            ? { customBlocks: readAssistantResponseCustomBlocks(result.response.body) }
            : {}),
          customBlockOrigin: 'ai-sdk.response-body',
          finishReason: typeof result.finishReason === 'string' ? result.finishReason : null,
          modelId: target.modelId,
          providerId: target.provider.id,
          text: typeof result.text === 'string' ? result.text : '',
          usage: result.usage as unknown as JsonValue,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text generation failed');
  }

  streamText(input: AiModelExecutionRequest & {
    abortSignal?: AbortSignal;
    stopWhen?: Parameters<typeof streamText>[0]['stopWhen'];
    tools?: Record<string, Tool>;
  }): AiModelExecutionStreamResult {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = this.startTextStream(input, target);

        return {
          finishReason: result.finishReason,
          fullStream: result.fullStream,
          modelId: target.modelId,
          providerId: target.provider.id,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text streaming failed');
  }

  private async collectStreamedTextResult(input: AiModelExecutionRequest): Promise<AiModelExecutionResult> {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = this.startTextStream(input, target);
        let text = '';
        let customBlocks: AssistantCustomBlockEntry[] = [];

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            text += part.text;
            continue;
          }
          if (part.type === 'raw') {
            customBlocks = applyAssistantCustomBlockUpdates(
              customBlocks,
              readAssistantRawCustomBlocks(part),
            );
          }
        }

        const usage = await readCollectedUsage(result);

        return {
          ...(customBlocks.length > 0 ? { customBlocks } : {}),
          customBlockOrigin: 'ai-sdk.raw',
          finishReason: readFinishReason(await result.finishReason),
          modelId: target.modelId,
          providerId: target.provider.id,
          text,
          ...(usage !== undefined ? { usage } : {}),
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text generation failed');
  }

  private buildExecutionTargets(input: AiModelExecutionRequest): AiExecutionTarget[] {
    const primary = this.resolveExecutionTarget(input.providerId, input.modelId);
    if (!input.allowFallbackChatModels) {return [primary];}
    return [primary, ...this.aiProviderSettingsService.getHostModelRoutingConfig().fallbackChatModels
      .filter((target) => target.providerId !== primary.provider.id || target.modelId !== primary.modelId)
      .map((target) => this.resolveExecutionTarget(target.providerId, target.modelId))];
  }

  private resolveExecutionTarget(
    providerId: string | undefined,
    modelId: string | undefined,
  ): AiExecutionTarget {
    const resolvedProviderId = providerId ?? this.aiProviderSettingsService.listProviders()[0]?.id;
    if (!resolvedProviderId) {throw new Error('No provider configured');}

    const provider = this.aiProviderSettingsService.getProvider(resolvedProviderId);
    const resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0];
    if (!resolvedModelId) {throw new Error(`Provider "${provider.id}" does not have any configured model`);}
    if (!provider.apiKey) {throw new Error(`Provider "${provider.id}" is missing apiKey`);}
    if (!provider.baseUrl) {throw new Error(`Provider "${provider.id}" is missing baseUrl`);}
    return { modelId: resolvedModelId, provider };
  }

  private buildExecutionInput(input: AiModelExecutionRequest, target: AiExecutionTarget) {
    const providerOptions = buildProviderOptions(input);
    return {
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      messages: buildExecutionMessages(input.messages),
      model: this.createLanguageModel(target),
      ...(providerOptions ? { providerOptions } : {}),
      ...(input.system ? { system: input.system } : {}),
    };
  }

  private startTextStream(
    input: AiModelExecutionRequest & {
      abortSignal?: AbortSignal;
      stopWhen?: Parameters<typeof streamText>[0]['stopWhen'];
      tools?: Record<string, Tool>;
    },
    target: AiExecutionTarget,
  ): ReturnType<typeof streamText> {
    return streamText({
      ...this.buildExecutionInput(input, target),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      includeRawChunks: true,
      ...(input.stopWhen ? { stopWhen: input.stopWhen } : {}),
      ...(input.tools ? { tools: input.tools } : {}),
    } as Parameters<typeof streamText>[0]);
  }

  private createLanguageModel(target: AiExecutionTarget): LanguageModel {
    if (target.provider.driver === 'anthropic') {
      return createAnthropic({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl })(target.modelId) as unknown as LanguageModel;
    }
    if (target.provider.driver === 'gemini') {
      const { createGoogleGenerativeAI } = localRequire('@ai-sdk/google') as {
        createGoogleGenerativeAI: (options: { apiKey: string; baseURL?: string }) => (modelId: string) => unknown;
      };
      return createGoogleGenerativeAI({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl })(target.modelId) as unknown as LanguageModel;
    }
    return createOpenAI({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl, name: target.provider.id }).chat(target.modelId) as unknown as LanguageModel;
  }
}

function applyAssistantCustomBlockUpdates(
  currentBlocks: AssistantCustomBlockEntry[],
  updates: AssistantCustomBlockEntry[],
): AssistantCustomBlockEntry[] {
  if (updates.length === 0) {
    return currentBlocks;
  }

  const nextBlocks = [...currentBlocks];
  for (const update of updates) {
    const blockIndex = nextBlocks.findIndex((entry) => entry.key === update.key);
    if (blockIndex < 0) {
      nextBlocks.push(update);
      continue;
    }
    nextBlocks[blockIndex] = update.kind === 'text'
      ? {
          key: update.key,
          kind: 'text',
          value: `${nextBlocks[blockIndex]?.kind === 'text' ? nextBlocks[blockIndex].value : ''}${update.value}`,
        }
      : update;
  }
  return nextBlocks;
}

function readFinishReason(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function readCollectedUsage(result: ReturnType<typeof streamText>): Promise<JsonValue | undefined> {
  return await result.totalUsage as unknown as JsonValue;
}

function buildExecutionMessages(messages: PluginLlmMessage[]): ModelMessage[] {
  return messages.map((message) => ({ content: buildExecutionMessageContent(message.content), role: message.role })) as unknown as ModelMessage[];
}

function buildExecutionMessageContent(
  content: PluginLlmMessage['content'],
): string | Array<{ image?: ArrayBuffer | string; mimeType?: string; text?: string; type: 'image' | 'text' }> {
  if (typeof content === 'string') {return content;}
  return content.map((part) =>
    part.type === 'text'
      ? {
          text: part.text,
          type: 'text' as const,
        }
      : {
          image: toAiSdkImageInput(part.image),
          ...(part.mimeType ? { mimeType: part.mimeType } : {}),
          type: 'image' as const,
        });
}

function buildProviderOptions(
  input: AiModelExecutionRequest,
): JsonObject | undefined {
  return input.variant ? { ...(input.providerOptions ?? {}), variant: input.variant } : input.providerOptions;
}

function readExecutionError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function toAiSdkImageInput(image: string): string | ArrayBuffer {
  if (!image.startsWith('data:')) {return image;}
  const matched = /^data:([^;]+);base64,(.+)$/u.exec(image);
  if (!matched) {throw new Error('Unsupported image data URL');}
  const binary = Buffer.from(matched[2], 'base64');
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}
