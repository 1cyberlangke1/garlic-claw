import type { ActionConfig, AutomationBeforeRunHookResult, AutomationInfo, JsonValue } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import { asJsonValue, cloneJsonValue } from '../../runtime/host/runtime-host-values';
import { RuntimeHostConversationMessageService } from '../../runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../../runtime/kernel/runtime-plugin-hook-governance';
import type { AutomationRunContext, RuntimeAutomationRecord } from './automation.service';

interface AutomationRunPlan {
  actions: ActionConfig[];
  automation: AutomationInfo;
  context: AutomationRunContext;
}
interface AutomationExecutionOutcome { results: JsonValue[]; status: string; }
interface ShortCircuitedAutomationRun extends AutomationExecutionOutcome { action: 'short-circuit'; }

@Injectable()
export class AutomationExecutionService {
  constructor(
    @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    @Inject(RuntimeHostConversationMessageService) private readonly conversationMessageService: RuntimeHostConversationMessageService,
  ) {}

  async executeAutomation(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    const plan = createAutomationRunPlan(automation);
    const prepared = await prepareAutomationRun(plan, this.runtimeHostPluginDispatchService);
    if ('action' in prepared) {
      return asJsonValue({ results: prepared.results, status: prepared.status });
    }
    const execution = await executeAutomationActions(prepared, this.runtimeHostPluginDispatchService, this.conversationMessageService);
    return asJsonValue(await settleAutomationRun(prepared, execution, this.runtimeHostPluginDispatchService));
  }
}

function createAutomationRunPlan(automation: RuntimeAutomationRecord): AutomationRunPlan {
  const conversationId = readAutomationConversationId(automation.actions);
  return {
    actions: automation.actions.map((action) => cloneJsonValue(action)),
    automation: toAutomationInfo(automation),
    context: {
      automationId: automation.id,
      ...(conversationId ? { conversationId } : {}),
      source: 'automation',
      userId: automation.userId,
    },
  };
}

function readAutomationConversationId(actions: ActionConfig[]): string | null {
  for (const action of actions) {
    if (action.type === 'ai_message' && action.target?.type === 'conversation' && typeof action.target.id === 'string' && action.target.id.trim()) {
      return action.target.id;
    }
  }
  return null;
}

async function prepareAutomationRun(
  plan: AutomationRunPlan,
  kernel: RuntimeHostPluginDispatchService,
): Promise<AutomationRunPlan | ShortCircuitedAutomationRun> {
  const result = await runDispatchableHookChain<ActionConfig[], AutomationBeforeRunHookResult, ShortCircuitedAutomationRun>({
    applyResponse: (actions, mutation) => mutation.action === 'short-circuit'
      ? { shortCircuitResult: { action: 'short-circuit', results: mutation.results, status: mutation.status } }
      : { state: Array.isArray(mutation.actions) ? mutation.actions : actions },
    hookName: 'automation:before-run',
    initialState: plan.actions,
    kernel,
    mapPayload: (actions) => asJsonValue({ context: plan.context, automation: plan.automation, actions }),
    readContext: () => plan.context,
  });
  if ('shortCircuitResult' in result) {
    return result.shortCircuitResult;
  }
  return { ...plan, actions: result.state };
}

async function executeAutomationActions(
  plan: AutomationRunPlan,
  kernel: RuntimeHostPluginDispatchService,
  conversationMessageService: RuntimeHostConversationMessageService,
): Promise<AutomationExecutionOutcome> {
  const results: JsonValue[] = [];
  let status = 'success';
  for (const action of plan.actions) {
    try {
      results.push(await executeAutomationAction(action, plan.context, kernel, conversationMessageService));
    } catch (error) {
      status = 'error';
      results.push({ action: action.type, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { results, status };
}

async function executeAutomationAction(
  action: ActionConfig,
  context: AutomationRunContext,
  kernel: RuntimeHostPluginDispatchService,
  conversationMessageService: RuntimeHostConversationMessageService,
): Promise<JsonValue> {
  if (action.type === 'device_command' && action.plugin && action.capability) {
    return {
      action: action.type,
      capability: action.capability,
      plugin: action.plugin,
      result: await kernel.executeTool({
        pluginId: action.plugin,
        toolName: action.capability,
        params: action.params || {},
        context,
      }),
    };
  }
  if (action.type !== 'ai_message') {
    return { action: action.type };
  }
  const message = action.message?.trim();
  if (!message) {
    throw new Error('ai_message 动作缺少 message');
  }
  const fallbackTarget = action.target;
  if (!fallbackTarget) {
    throw new Error('ai_message 动作缺少 target');
  }
  const result = await conversationMessageService.sendMessage(context, {
    content: message,
    target: {
      id: fallbackTarget.id,
      type: fallbackTarget.type,
    },
  });
  return {
    action: action.type,
    target: readAutomationMessageTarget(result, fallbackTarget),
    result,
  };
}

async function settleAutomationRun(
  plan: AutomationRunPlan,
  execution: AutomationExecutionOutcome,
  kernel: RuntimeHostPluginDispatchService,
): Promise<AutomationExecutionOutcome> {
  return applyMutatingDispatchableHooks({
    applyMutation: (next, mutation) => ({
      status: typeof mutation.status === 'string' ? mutation.status : next.status,
      results: Array.isArray(mutation.results) ? mutation.results : next.results,
    }),
    hookName: 'automation:after-run',
    kernel,
    payload: execution,
    mapPayload: (next) => asJsonValue({
      context: plan.context,
      automation: plan.automation,
      status: next.status,
      results: next.results,
    }),
    readContext: () => plan.context,
  });
}

function readAutomationMessageTarget(
  result: JsonValue,
  fallbackTarget: { id: string; type: 'conversation' },
): { id: string; label?: string; type: 'conversation' } {
  const target = (result as { target?: { id?: unknown; label?: unknown; type?: unknown } }).target;
  if (target && typeof target.id === 'string' && target.type === 'conversation') {
    return { id: target.id, ...(typeof target.label === 'string' ? { label: target.label } : {}), type: 'conversation' };
  }
  return { id: fallbackTarget.id, type: fallbackTarget.type };
}

function toAutomationInfo(automation: RuntimeAutomationRecord): AutomationInfo {
  const { logs: _logs, userId: _userId, ...rest } = automation;
  return {
    ...rest,
    actions: automation.actions.map((action) => cloneJsonValue(action)),
    trigger: cloneJsonValue(automation.trigger),
  };
}
