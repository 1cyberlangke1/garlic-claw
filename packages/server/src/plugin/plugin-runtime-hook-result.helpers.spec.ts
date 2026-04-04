import {
  normalizeChatBeforeModelHookResult,
  normalizeMessageReceivedHookResult,
} from '@garlic-claw/shared';
import {
  normalizeChatAfterModelHookResult,
  normalizeMessageCreatedHookResult,
  normalizeMessageUpdatedHookResult,
} from '@garlic-claw/shared';
import {
  normalizeAutomationAfterRunHookResult,
  normalizeAutomationBeforeRunHookResult,
  normalizeResponseBeforeSendHookResult,
  normalizeToolAfterCallHookResult,
  normalizeToolBeforeCallHookResult,
} from '@garlic-claw/shared';
import {
  normalizeSubagentAfterRunHookResult,
  normalizeSubagentBeforeRunHookResult,
} from '@garlic-claw/shared';

describe('plugin-runtime-hook-result.helpers', () => {
  it('normalizes chat hook results', () => {
    expect(
      normalizeChatBeforeModelHookResult({
        action: 'mutate',
        providerId: 'provider-1',
        modelId: 'model-1',
        toolNames: ['search'],
      }),
    ).toEqual({
      action: 'mutate',
      providerId: 'provider-1',
      modelId: 'model-1',
      toolNames: ['search'],
    });

    expect(
      normalizeChatAfterModelHookResult({
        action: 'mutate',
        assistantContent: 'done',
      }),
    ).toEqual({
      action: 'mutate',
      assistantContent: 'done',
    });

    expect(() =>
      normalizeChatBeforeModelHookResult({
        action: 'mutate',
        toolNames: [1],
      } as never),
    ).toThrow('chat:before-model Hook 的 toolNames 必须是字符串数组');
  });

  it('normalizes message hook results', () => {
    expect(
      normalizeMessageReceivedHookResult({
        action: 'short-circuit',
        assistantContent: 'handled',
      }),
    ).toEqual({
      action: 'short-circuit',
      assistantContent: 'handled',
    });

    expect(
      normalizeMessageCreatedHookResult({
        action: 'mutate',
        content: 'hello',
        status: 'completed',
      }),
    ).toEqual({
      action: 'mutate',
      content: 'hello',
      status: 'completed',
    });

    expect(
      normalizeMessageUpdatedHookResult({
        action: 'mutate',
        model: 'gpt-test',
      }),
    ).toEqual({
      action: 'mutate',
      model: 'gpt-test',
    });

    expect(() =>
      normalizeMessageCreatedHookResult({
        action: 'mutate',
        status: 'done',
      } as never),
    ).toThrow('message:created Hook 的 status 必须是合法消息状态或 null');
  });

  it('normalizes automation hook results', () => {
    expect(
      normalizeAutomationBeforeRunHookResult({
        action: 'short-circuit',
        status: 'skipped',
        results: [{ ok: true }],
      }),
    ).toEqual({
      action: 'short-circuit',
      status: 'skipped',
      results: [{ ok: true }],
    });

    expect(
      normalizeAutomationAfterRunHookResult({
        action: 'mutate',
        status: 'completed',
        results: ['done'],
      }),
    ).toEqual({
      action: 'mutate',
      status: 'completed',
      results: ['done'],
    });

    expect(() =>
      normalizeAutomationBeforeRunHookResult({
        action: 'mutate',
        actions: [{ type: 'ai_message', target: { type: 'user' } }],
      } as never),
    ).toThrow('automation:before-run Hook 的 actions 必须是动作数组');
  });

  it('normalizes subagent hook results', () => {
    expect(
      normalizeSubagentBeforeRunHookResult({
        action: 'mutate',
        providerId: 'provider-1',
        messages: [{ role: 'user', content: 'hello' }],
        maxSteps: 5,
      }),
    ).toEqual({
      action: 'mutate',
      providerId: 'provider-1',
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 5,
    });

    expect(
      normalizeSubagentAfterRunHookResult({
        action: 'mutate',
        text: 'done',
        finishReason: 'stop',
      }),
    ).toEqual({
      action: 'mutate',
      text: 'done',
      finishReason: 'stop',
    });

    expect(() =>
      normalizeSubagentBeforeRunHookResult({
        action: 'short-circuit',
        text: 'done',
        toolCalls: [{ toolCallId: 'call-1' }],
      } as never),
    ).toThrow('subagent:before-run Hook 的 toolCalls 必须是工具调用数组');
  });

  it('normalizes tool and response hook results', () => {
    expect(
      normalizeToolBeforeCallHookResult({
        action: 'short-circuit',
        output: {
          ok: true,
        },
      }),
    ).toEqual({
      action: 'short-circuit',
      output: {
        ok: true,
      },
    });

    expect(
      normalizeToolAfterCallHookResult({
        action: 'mutate',
        output: 'done',
      }),
    ).toEqual({
      action: 'mutate',
      output: 'done',
    });

    expect(
      normalizeResponseBeforeSendHookResult({
        action: 'mutate',
        assistantContent: 'done',
        toolCalls: [],
        toolResults: [],
      }),
    ).toEqual({
      action: 'mutate',
      assistantContent: 'done',
      toolCalls: [],
      toolResults: [],
    });

    expect(() =>
      normalizeToolBeforeCallHookResult({
        action: 'mutate',
        params: [],
      } as never),
    ).toThrow('tool:before-call Hook 的 params 必须是对象');

    expect(() =>
      normalizeResponseBeforeSendHookResult({
        action: 'mutate',
        assistantContent: 'done',
        toolCalls: {},
      } as never),
    ).toThrow('response:before-send Hook 的 toolCalls 必须是数组');
  });
});
