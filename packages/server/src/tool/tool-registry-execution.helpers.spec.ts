import type { PluginCallContext } from '@garlic-claw/shared';
import { buildAiToolSetFromResolvedTools } from './tool-registry-execution.helpers';
import type { ResolvedToolRecord } from './tool.types';

describe('tool-registry-execution.helpers', () => {
  const context: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
  };

  function createRuntime() {
    return {
      runToolBeforeCallHooks: jest.fn().mockImplementation(async (input) => ({
        action: 'continue',
        payload: input.payload,
      })),
      runToolAfterCallHooks: jest.fn().mockImplementation(async (input) => input.payload),
    };
  }

  function createResolvedEntry(
    overrides: Partial<ResolvedToolRecord> = {},
  ): ResolvedToolRecord {
    const executeTool = jest.fn().mockResolvedValue({
      weather: 'sunny',
    });

    return {
      provider: {
        kind: 'mcp',
        listSources: jest.fn(),
        listTools: jest.fn(),
        executeTool,
      },
      raw: {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
      },
      record: {
        toolId: 'mcp:weather:get_forecast',
        toolName: 'get_forecast',
        callName: 'mcp__weather__get_forecast',
        description: '[MCP：weather] 获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
        enabled: true,
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: null,
        },
      },
      ...overrides,
    };
  }

  it('returns undefined when no allowed tool names match', () => {
    const toolSet = buildAiToolSetFromResolvedTools({
      resolvedTools: [createResolvedEntry()],
      context,
      allowedToolNames: ['missing_tool'],
      pluginRuntime: createRuntime() as never,
    });

    expect(toolSet).toBeUndefined();
  });

  it('wraps tool execution with before and after hooks', async () => {
    const pluginRuntime = createRuntime();
    const entry = createResolvedEntry();
    pluginRuntime.runToolBeforeCallHooks.mockImplementation(async (input) => ({
      action: 'continue',
      payload: {
        ...input.payload,
        params: {
          city: 'Suzhou',
        },
      },
    }));
    pluginRuntime.runToolAfterCallHooks.mockImplementation(async (input) => ({
      ...input.payload,
      output: {
        ...(input.payload.output as Record<string, unknown>),
        audited: true,
      },
    }));

    const toolSet = buildAiToolSetFromResolvedTools({
      resolvedTools: [entry],
      context,
      pluginRuntime: pluginRuntime as never,
    });
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await expect(
      executableToolSet.mcp__weather__get_forecast.execute({
        city: 'Shanghai',
      }),
    ).resolves.toEqual({
      weather: 'sunny',
      audited: true,
    });
    expect(pluginRuntime.runToolBeforeCallHooks).toHaveBeenCalledWith({
      context,
      payload: expect.objectContaining({
        context,
        params: {
          city: 'Shanghai',
        },
      }),
    });
    expect(entry.provider.executeTool).toHaveBeenCalledWith({
      tool: entry.raw,
      params: {
        city: 'Suzhou',
      },
      context,
      skipLifecycleHooks: false,
    });
  });
});
