import {
  buildSubagentDelegateRunParams,
  buildSubagentDelegateTaskParams,
  createSubagentRunSummary,
  createSubagentTaskSummaryResult,
  readBooleanFlag,
  readOptionalStringParam,
  readRequiredTextValue,
  readSubagentDelegateConfig,
  SUBAGENT_DELEGATE_MANIFEST,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';

export const BUILTIN_SUBAGENT_DELEGATE_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: SUBAGENT_DELEGATE_MANIFEST,
  tools: {
    delegate_summary: async (params, context) => {
      const prompt = readRequiredTextValue(params.prompt, 'delegate_summary 的 prompt');
      const description = readOptionalStringParam(params, 'description') ?? undefined;
      const sessionId = readOptionalStringParam(params, 'sessionId') ?? undefined;
      const subagentType = readOptionalStringParam(params, 'subagentType') ?? undefined;
      const config = readSubagentDelegateConfig(await context.host.getConfig());
      const result = await context.host.runSubagent(buildSubagentDelegateRunParams({
        config,
        prompt,
        ...(description ? { description } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(subagentType ? { subagentType } : {}),
      }));

      return createSubagentRunSummary(result);
    },
    delegate_summary_background: async (params, context) => {
      const prompt = readRequiredTextValue(params.prompt, 'delegate_summary_background 的 prompt');
      const description = readOptionalStringParam(params, 'description') ?? undefined;
      const sessionId = readOptionalStringParam(params, 'sessionId') ?? undefined;
      const subagentType = readOptionalStringParam(params, 'subagentType') ?? undefined;
      const config = readSubagentDelegateConfig(await context.host.getConfig());
      const shouldWriteBack = readBooleanFlag(
        params.writeBack,
        Boolean(context.callContext.conversationId),
      );
      const task = await context.host.startSubagentTask(buildSubagentDelegateTaskParams({
        config,
        prompt,
        shouldWriteBack,
        conversationId: context.callContext.conversationId,
        ...(description ? { description } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(subagentType ? { subagentType } : {}),
      }));

      return createSubagentTaskSummaryResult(task);
    },
  },
};
