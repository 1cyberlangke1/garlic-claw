import type {
  AiUtilityModelRole,
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginLlmMessage,
  PluginProviderSummary,
} from '@garlic-claw/shared';
import {
  buildCurrentHostProviderInfo,
  buildHostGenerateResult,
  buildHostGenerateTextResult,
  findHostProviderSummary,
  resolveHostProviderModelSummary,
  resolveHostUtilityRoleForGeneration,
} from '@garlic-claw/shared';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { AiManagementService } from '../ai/ai-management.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { ModelRegistryService } from '../ai/registry/model-registry.service';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import {
  readHostNumber,
  readHostObject,
  readHostString,
  readHostStringRecord,
  requireHostString,
} from './plugin-host-request.codec';
import { readPluginLlmMessages } from './plugin-llm-payload.helpers';

export function readHostGenerateParams(
  params: JsonObject,
  messages: PluginLlmGenerateParams['messages'],
): PluginLlmGenerateParams {
  const providerId = readHostString(params, 'providerId') ?? undefined;
  const modelId = readHostString(params, 'modelId') ?? undefined;
  const system = readHostString(params, 'system') ?? undefined;
  const variant = readHostString(params, 'variant') ?? undefined;
  const providerOptions = readHostObject(params, 'providerOptions') ?? undefined;
  const headers = readHostStringRecord(params, 'headers') ?? undefined;
  const maxOutputTokens = readHostNumber(params, 'maxOutputTokens') ?? undefined;

  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(system ? { system } : {}),
    ...(variant ? { variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    messages,
  };
}

export function readHostLlmMessages(params: JsonObject): PluginLlmMessage[] {
  return readPluginLlmMessages(params.messages, {
    arrayLabel: 'messages',
  });
}

export function findHostProviderSummaryOrThrow(input: {
  providers: PluginProviderSummary[];
  providerId: string;
  ensureExists?: (providerId: string) => unknown;
}): PluginProviderSummary {
  const provider = findHostProviderSummary(input.providers, input.providerId);
  if (provider) {
    return provider;
  }

  input.ensureExists?.(input.providerId);
  throw new NotFoundException(`Provider "${input.providerId}" not found`);
}

export function buildHostGenerateExecutionInput(input: {
  params: PluginLlmGenerateParams;
  utilityRole?: AiUtilityModelRole;
}) {
  return {
    ...(input.params.providerId ? { providerId: input.params.providerId } : {}),
    ...(input.params.modelId ? { modelId: input.params.modelId } : {}),
    ...(input.utilityRole ? { utilityRole: input.utilityRole } : {}),
    ...(input.params.system ? { system: input.params.system } : {}),
    ...(input.params.variant ? { variant: input.params.variant } : {}),
    ...(input.params.providerOptions ? { providerOptions: input.params.providerOptions } : {}),
    ...(input.params.headers ? { headers: input.params.headers } : {}),
    ...(typeof input.params.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.params.maxOutputTokens }
      : {}),
    sdkMessages: toAiSdkMessages(input.params.messages),
  };
}

/**
 * Host API 的 AI 能力面。
 *
 * 输入:
 * - provider 查询
 * - 模型查询
 * - `llm.generate*` 请求
 *
 * 输出:
 * - 安全 provider/model 摘要
 * - 统一生成结果
 *
 * 预期行为:
 * - 把 provider / llm 编排从 `PluginHostService` 主类中剥离
 * - 继续保持统一 Host API 语义
 * - 让 Host 主类更接近纯分发表
 */
@Injectable()
export class PluginHostAiFacade {
  constructor(
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly aiProviderService: AiProviderService,
    private readonly aiManagementService: AiManagementService,
    private readonly modelRegistryService: ModelRegistryService,
  ) {}

  getCurrentProvider(context: PluginCallContext): JsonValue {
    return toJsonValue(
      buildCurrentHostProviderInfo(
        context,
        this.aiProviderService.getModelConfig(),
      ),
    );
  }

  listProviders(): JsonValue {
    return toJsonValue(
      this.aiManagementService.listProviders(),
    );
  }

  getProvider(params: JsonObject): JsonValue {
    const providerId = requireHostString(params, 'providerId');
    return toJsonValue(
      findHostProviderSummaryOrThrow({
        providers: this.aiManagementService.listProviders(),
        providerId,
        ensureExists: (missingProviderId) => {
          this.aiManagementService.getProvider(missingProviderId);
        },
      }),
    );
  }

  getProviderModel(params: JsonObject): JsonValue {
    const providerId = requireHostString(params, 'providerId');
    const modelId = requireHostString(params, 'modelId');
    const model = resolveHostProviderModelSummary({
      registryModel: this.modelRegistryService.getModel(providerId, modelId) ?? undefined,
      listedModels: this.aiManagementService.listModels(providerId),
      modelId,
    });
    if (!model) {
      throw new NotFoundException(
        `Model "${modelId}" not found for provider "${providerId}"`,
      );
    }

    return toJsonValue(model);
  }

  async generateText(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const prompt = requireHostString(params, 'prompt');
    const result = await this.generateCore(
      pluginId,
      context,
      readHostGenerateParams(params, [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ]),
    );

    return buildHostGenerateTextResult(result);
  }

  async generate(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    return toJsonValue(
      await this.generateCore(
        pluginId,
        context,
        readHostGenerateParams(params, readHostLlmMessages(params)),
      ),
    );
  }

  private async generateCore(
    pluginId: string,
    context: PluginCallContext,
    params: PluginLlmGenerateParams,
  ): Promise<PluginLlmGenerateResult> {
    const utilityRole = resolveHostUtilityRoleForGeneration(
      pluginId,
      context,
      params,
    );
    const executed = await this.aiModelExecution.generateText(
      buildHostGenerateExecutionInput({
        params,
        utilityRole,
      }),
    );

    return buildHostGenerateResult(executed);
  }
}
