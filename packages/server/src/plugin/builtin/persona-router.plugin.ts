import {
  PERSONA_ROUTER_MANIFEST,
  asChatBeforeModelPayload,
  createPassHookResult,
  createSystemPromptMutateResult,
  readCurrentPersonaInfo,
  readLatestUserTextFromMessages,
  readPersonaRouterConfig,
  readPersonaSummaryInfo,
  sanitizeOptionalText,
  textIncludesKeyword,
} from '@garlic-claw/plugin-sdk/authoring';
import type { JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建 persona 上下文路由插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:before-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 只通过统一 Host API 读取当前 persona
 * - 在命中规则时切换当前会话 persona
 * - 让本轮模型调用立即使用新 persona 的 prompt
 */
export function createPersonaRouterPlugin(): BuiltinPluginDefinition {
  return {
    manifest: PERSONA_ROUTER_MANIFEST,
    hooks: {
      /**
       * 在模型调用前按配置切换 persona。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns `pass` 或 `mutate`
       */
      'chat:before-model': async (payload, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const config = readPersonaRouterConfig(await context.host.getConfig());
        const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
        const targetPersonaId = sanitizeOptionalText(config.targetPersonaId);
        if (!targetPersonaId || !textIncludesKeyword(latestUserText, config.switchKeyword)) {
          return createPassHookResult();
        }

        const currentPersona = readCurrentPersonaInfo(
          await context.host.getCurrentPersona(),
        );
        if (currentPersona.personaId === targetPersonaId) {
          return createPassHookResult();
        }

        const targetPersona = readPersonaSummaryInfo(
          (await context.host.getPersona(targetPersonaId)) as unknown as JsonValue,
        );
        const activatedPersona = readPersonaSummaryInfo(
          (await context.host.activatePersona(targetPersonaId)) as unknown as JsonValue,
        );
        const prompt = sanitizeOptionalText(activatedPersona.prompt)
          || sanitizeOptionalText(targetPersona.prompt);
        if (!prompt) {
          return createPassHookResult();
        }

        return createSystemPromptMutateResult(prompt);
      },
    },
  };
}
