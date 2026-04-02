import type {
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { AiManagementService } from '../ai/ai-management.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { ModelRegistryService } from '../ai/registry/model-registry.service';
import {
  buildCurrentHostProviderInfo,
  buildHostGenerateExecutionInput,
  buildHostGenerateResult,
  buildHostGenerateTextResult,
  findHostProviderSummaryOrThrow,
  readHostGenerateParams,
  readHostLlmMessages,
  requireHostString,
  resolveHostProviderModelSummary,
  resolveHostUtilityRoleForGeneration,
} from './plugin-host.helpers';

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
