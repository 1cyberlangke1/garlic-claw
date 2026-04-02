import {
  requireRuntimeConversationId,
  readRuntimeAutomationActions,
  readRuntimeAutomationTrigger,
  readOptionalRuntimeMessageTarget,
  readRuntimeLlmMessages,
  readRuntimeSubagentRequest,
  readRuntimeSubagentTaskStartParams,
  readRuntimeTimeoutMs,
  requirePositiveRuntimeNumber,
  requireRuntimeJsonObjectValue,
  requireRuntimeString,
  requireRuntimeUserId,
} from './plugin-runtime-input.helpers';

describe('plugin-runtime-input.helpers', () => {
  it('reads runtime timeout from context metadata', () => {
    expect(
      readRuntimeTimeoutMs(
        {
          source: 'plugin',
          metadata: {
            timeoutMs: 1234,
          },
        },
        100,
      ),
    ).toBe(1234);

    expect(
      readRuntimeTimeoutMs(
        {
          source: 'plugin',
          metadata: {
            timeoutMs: -1,
          },
        },
        100,
      ),
    ).toBe(100);

    expect(
      requireRuntimeConversationId(
        {
          source: 'plugin',
          conversationId: 'conversation-1',
        },
        'conversation.session.get',
      ),
    ).toBe('conversation-1');

    expect(
      requireRuntimeUserId(
        {
          source: 'plugin',
          userId: 'user-1',
        },
        'automation.list',
      ),
    ).toBe('user-1');
  });

  it('reads required string and positive number params', () => {
    expect(
      requireRuntimeString(
        {
          name: 'demo',
        },
        'name',
        'automation.create',
      ),
    ).toBe('demo');

    expect(
      requirePositiveRuntimeNumber(
        {
          timeoutMs: 20,
        },
        'timeoutMs',
        'conversation.session.start',
      ),
    ).toBe(20);
  });

  it('reads message target and llm messages', () => {
    expect(
      readOptionalRuntimeMessageTarget(
        {
          target: {
            type: 'conversation',
            id: ' conversation-1 ',
          },
        },
        'target',
        'message.send',
      ),
    ).toEqual({
      type: 'conversation',
      id: 'conversation-1',
    });

    expect(
      readRuntimeLlmMessages(
        {
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
        },
        'subagent.run',
      ),
    ).toEqual([
      {
        role: 'user',
        content: 'hello',
      },
    ]);

    expect(
      readRuntimeSubagentRequest(
        {
          providerId: 'provider-1',
          modelId: 'model-1',
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
          maxSteps: 7,
        },
        'subagent.run',
      ),
    ).toEqual({
      providerId: 'provider-1',
      modelId: 'model-1',
      messages: [
        {
          role: 'user',
          content: 'hello',
        },
      ],
      maxSteps: 7,
    });

    expect(
      readRuntimeSubagentTaskStartParams(
        {
          messages: [
            {
              role: 'user',
              content: 'hello',
            },
          ],
          writeBack: {
            target: {
              type: 'conversation',
              id: 'conversation-1',
            },
          },
        },
        'subagent.task.start',
      ),
    ).toEqual({
      request: {
        messages: [
          {
            role: 'user',
            content: 'hello',
          },
        ],
        maxSteps: 5,
      },
      writeBackTarget: {
        type: 'conversation',
        id: 'conversation-1',
      },
    });

    expect(
      readRuntimeAutomationTrigger(
        {
          trigger: {
            type: 'event',
            event: 'demo.event',
          },
        },
        'automation.create',
      ),
    ).toEqual({
      type: 'event',
      event: 'demo.event',
    });

    expect(
      readRuntimeAutomationActions(
        {
          actions: [
            {
              type: 'device_command',
              plugin: 'plugin-pc',
              capability: 'shell.exec',
              params: {
                command: 'echo hi',
              },
            },
            {
              type: 'ai_message',
              message: 'done',
              target: {
                type: 'conversation',
                id: 'conversation-2',
              },
            },
          ],
        },
        'automation.create',
      ),
    ).toEqual([
      {
        type: 'device_command',
        plugin: 'plugin-pc',
        capability: 'shell.exec',
        params: {
          command: 'echo hi',
        },
      },
      {
        type: 'ai_message',
        message: 'done',
        target: {
          type: 'conversation',
          id: 'conversation-2',
        },
      },
    ]);
  });

  it('throws readable runtime labels for invalid values', () => {
    expect(() =>
      requireRuntimeJsonObjectValue([], 'message.send 的 target'),
    ).toThrow('message.send 的 target 必须是对象');

    expect(() =>
      requirePositiveRuntimeNumber(
        {
          timeoutMs: 0,
        },
        'timeoutMs',
        'conversation.session.start',
      ),
    ).toThrow('conversation.session.start 的 timeoutMs 必须是正数');
  });
});
