import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSubagentTypeRegistryService } from '../../../src/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';

describe('RuntimeHostSubagentRunnerService', () => {
  let conversationsPath: string;

  beforeEach(() => {
    jest.useFakeTimers();
    conversationsPath = path.join(os.tmpdir(), `gc-subagent-runner-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    if (fs.existsSync(conversationsPath)) {
      fs.unlinkSync(conversationsPath);
    }
  });

  it('spawns a child conversation and completes execution in the child conversation itself', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '总结当前对话',
      messages: [{ content: '请帮我总结当前对话', role: 'user' }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    } as never) as { conversationId: string; status: string };

    expect(summary).toMatchObject({
      conversationId: expect.any(String),
      status: 'queued',
    });

    await jest.runAllTimersAsync();

    const detail = fixture.runner.getSubagent('builtin.memory', summary.conversationId);
    expect(detail).toMatchObject({
      conversationId: summary.conversationId,
      messageCount: 2,
      result: {
        text: 'Generated: 请帮我总结当前对话',
      },
      status: 'completed',
    });
    expect(fixture.recordService.requireConversation(summary.conversationId, 'user-1').parentId).toBe(fixture.parentConversationId);
    expect(fixture.recordService.requireConversation(fixture.parentConversationId, 'user-1').messages).toEqual([]);
  });

  it('continues the same child conversation through sendInputSubagent', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '第一轮', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };
    await jest.runAllTimersAsync();

    const continued = await fixture.runner.sendInputSubagent('builtin.memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      conversationId: summary.conversationId,
      description: '第二轮',
      messages: [{ content: '第二轮', role: 'user' }],
    });
    expect(continued).toMatchObject({
      conversationId: summary.conversationId,
      status: 'queued',
    });

    await jest.runAllTimersAsync();

    expect(fixture.runner.getSubagent('builtin.memory', summary.conversationId)).toMatchObject({
      conversationId: summary.conversationId,
      description: '第二轮',
      messageCount: 4,
      result: {
        text: 'Generated: 第二轮',
      },
      status: 'completed',
    });
  });

  it('interrupts a queued subagent before it starts running', async () => {
    const fixture = createFixture();
    const executeSubagent = jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    }));
    Reflect.set(fixture.runner as object, 'executeSubagent', executeSubagent);

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '稍后执行', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    const interrupted = await fixture.runner.interruptSubagent('builtin.memory', summary.conversationId, 'user-1');
    expect(interrupted).toMatchObject({
      conversationId: summary.conversationId,
      status: 'interrupted',
    });

    await jest.runAllTimersAsync();

    expect(executeSubagent).not.toHaveBeenCalled();
    expect(fixture.runner.getSubagent('builtin.memory', summary.conversationId)).toMatchObject({
      conversationId: summary.conversationId,
      error: '子代理已被手动中断',
      status: 'interrupted',
    });
  });

  it('closes a completed subagent conversation', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '可关闭会话', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };
    await jest.runAllTimersAsync();

    const closed = await fixture.runner.closeSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    }, 'user-1');

    expect(closed).toMatchObject({
      conversationId: summary.conversationId,
      status: 'closed',
    });
  });

  it('waits successfully even if the subagent completes before the waiter is fully attached', async () => {
    const fixture = createFixture();
    let releaseExecution!: () => void
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => {
      await new Promise<void>((resolve) => {
        releaseExecution = resolve
      })
      return {
        message: {
          content: `Generated: ${readLatestPrompt(request.messages)}`,
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: `Generated: ${readLatestPrompt(request.messages)}`,
        toolCalls: [],
        toolResults: [],
      }
    }));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '快速完成', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string }

    const waitPromise = fixture.runner.waitSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    })

    await jest.advanceTimersByTimeAsync(0)
    releaseExecution()
    await jest.runAllTimersAsync()

    await expect(waitPromise).resolves.toMatchObject({
      conversationId: summary.conversationId,
      result: 'Generated: 快速完成',
      status: 'completed',
    })
  });

  it('resumes queued conversations and converts stale running conversations to interrupted', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const queuedConversationId = (fixture.recordService.createConversation({
      kind: 'subagent',
      parentId: fixture.parentConversationId,
      subagent: {
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '恢复执行',
        requestedAt: '2026-04-30T10:00:00.000Z',
        runtimeKind: 'local',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
      title: 'Queued',
      userId: 'user-1',
    }) as { id: string }).id;
    fixture.recordService.replaceMessages(queuedConversationId, [
      {
        content: '恢复执行',
        createdAt: '2026-04-30T10:00:00.000Z',
        id: 'user-message-1',
        parts: [{ text: '恢复执行', type: 'text' }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-30T10:00:00.000Z',
      } as never,
    ], 'user-1');

    const runningConversationId = (fixture.recordService.createConversation({
      kind: 'subagent',
      parentId: fixture.parentConversationId,
      subagent: {
        activeAssistantMessageId: 'running-assistant-1',
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '重启中断',
        requestedAt: '2026-04-30T10:00:00.000Z',
        runtimeKind: 'local',
        status: 'running',
        startedAt: '2026-04-30T10:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
      title: 'Running',
      userId: 'user-1',
    }) as { id: string }).id;
    fixture.recordService.replaceMessages(runningConversationId, [
      {
        content: '重启中断',
        createdAt: '2026-04-30T10:00:00.000Z',
        id: 'running-user-1',
        parts: [{ text: '重启中断', type: 'text' }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-30T10:00:00.000Z',
      } as never,
      {
        content: '执行到一半…',
        createdAt: '2026-04-30T10:00:01.000Z',
        id: 'running-assistant-1',
        parts: [{ text: '执行到一半…', type: 'text' }],
        role: 'assistant',
        status: 'streaming',
        updatedAt: '2026-04-30T10:00:01.000Z',
      } as never,
    ], 'user-1');

    fixture.runner.resumePendingSubagents('builtin.memory');
    await jest.runAllTimersAsync();

    expect(fixture.runner.getSubagent('builtin.memory', queuedConversationId)).toMatchObject({
      conversationId: queuedConversationId,
      status: 'completed',
    });
    expect(fixture.runner.getSubagent('builtin.memory', runningConversationId)).toMatchObject({
      conversationId: runningConversationId,
      error: '服务重启时中断了正在运行的子代理',
      status: 'interrupted',
    });
    expect(fixture.recordService.requireConversation(runningConversationId, 'user-1').messages.at(-1)).toMatchObject({
      error: '服务重启时中断了正在运行的子代理',
      id: 'running-assistant-1',
      role: 'assistant',
      status: 'stopped',
    });
  });
});

function createFixture() {
  const recordService = new RuntimeHostConversationRecordService();
  const parentConversationId = (recordService.createConversation({
    title: 'Parent Chat',
    userId: 'user-1',
  }) as { id: string }).id;
  const runner = new RuntimeHostSubagentRunnerService(
    {} as never,
    new RuntimeHostConversationMessageService(recordService),
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
      listPlugins: jest.fn().mockReturnValue([]),
    } as never,
    new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    recordService,
  );
  return {
    parentConversationId,
    recordService,
    runner,
  };
}

function readLatestPrompt(messages: Array<{ role?: string; content: string | Array<{ text?: string; type: string }> }>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
    const text = message.content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }
  return '';
}
