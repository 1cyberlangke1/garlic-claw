import type { PluginAvailableToolSummary, PluginCapability } from '@garlic-claw/shared';
import type { Tool } from 'ai';
import { filterToolSet, getPluginTools, getPluginToolSummaries } from './tools';

function createRuntimeStub(entries: Array<{
  pluginId: string;
  runtimeKind: 'builtin' | 'remote';
  tool: PluginCapability;
}>) {
  return {
    listTools: jest.fn().mockReturnValue(entries),
    executeTool: jest.fn().mockResolvedValue({ ok: true }),
  };
}

const runtimeContext = {
  source: 'chat-tool' as const,
  userId: 'user-1',
  conversationId: 'conversation-1',
  activeProviderId: 'provider-1',
  activeModelId: 'model-1',
};

describe('ai/tools', () => {
  it('builds builtin and remote plugin tool sets with shared naming rules', async () => {
    const runtime = createRuntimeStub([
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: {
          name: 'save_memory',
          description: '保存记忆',
          parameters: {
            content: {
              type: 'string',
              required: true,
            },
          },
        },
      },
      {
        pluginId: 'remote.weather',
        runtimeKind: 'remote',
        tool: {
          name: 'forecast',
          description: '天气预报',
          parameters: {},
        },
      },
    ]);

    const toolSet = getPluginTools(runtime as never, runtimeContext) as Record<string, Tool>;

    expect(Object.keys(toolSet)).toEqual(['save_memory', 'remote.weather__forecast']);
    expect(runtime.listTools).toHaveBeenCalledWith(runtimeContext);

    const remoteTool = toolSet['remote.weather__forecast'] as Tool & {
      execute: (args: Record<string, never>) => Promise<unknown>;
    };
    await expect(remoteTool.execute({})).resolves.toEqual({ ok: true });
    expect(runtime.executeTool).toHaveBeenCalledWith({
      pluginId: 'remote.weather',
      toolName: 'forecast',
      params: {},
      context: runtimeContext,
    });
  });

  it('projects plugin tool summaries with the same call name and description rules', () => {
    const runtime = createRuntimeStub([
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: {
          name: 'save_memory',
          description: '保存记忆',
          parameters: {},
        },
      },
      {
        pluginId: 'remote.weather',
        runtimeKind: 'remote',
        tool: {
          name: 'forecast',
          description: '天气预报',
          parameters: {},
        },
      },
    ]);

    expect(getPluginToolSummaries(runtime as never, runtimeContext)).toEqual<PluginAvailableToolSummary[]>([
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        name: 'remote.weather__forecast',
        description: '[插件：remote.weather] 天气预报',
        parameters: {},
        pluginId: 'remote.weather',
        runtimeKind: 'remote',
      },
    ]);
  });

  it('filters tool sets by allowed tool names and returns undefined when empty', () => {
    const tools = {
      save_memory: {} as Tool,
      'remote.weather__forecast': {} as Tool,
    };

    expect(filterToolSet(tools, ['remote.weather__forecast'])).toEqual({
      'remote.weather__forecast': tools['remote.weather__forecast'],
    });
    expect(filterToolSet(tools, ['missing'])).toBeUndefined();
    expect(filterToolSet({}, undefined)).toBeUndefined();
  });
});
