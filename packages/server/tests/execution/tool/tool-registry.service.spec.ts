import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/execution/automation/automation.service';
import { BashToolService } from '../../../src/execution/bash/bash-tool.service';
import { EditToolService } from '../../../src/execution/edit/edit-tool.service';
import { RuntimeHostFilesystemBackendService } from '../../../src/execution/file/runtime-host-filesystem-backend.service';
import { GlobToolService } from '../../../src/execution/glob/glob-tool.service';
import { GrepToolService } from '../../../src/execution/grep/grep-tool.service';
import { InvalidToolService } from '../../../src/execution/invalid/invalid-tool.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/execution/project/project-worktree-root.service';
import { ReadToolService } from '../../../src/execution/read/read-tool.service';
import { RuntimeCommandService } from '../../../src/execution/runtime/runtime-command.service';
import { RuntimeCommandCaptureService } from '../../../src/execution/runtime/runtime-command-capture.service';
import { RuntimeJustBashService } from '../../../src/execution/runtime/runtime-just-bash.service';
import { RuntimeNativeShellService } from '../../../src/execution/runtime/runtime-native-shell.service';
import { RuntimeBackendRoutingService } from '../../../src/execution/runtime/runtime-backend-routing.service';
import type { RuntimeBackend } from '../../../src/execution/runtime/runtime-command.types';
import { RuntimeFilesystemBackendService } from '../../../src/execution/runtime/runtime-filesystem-backend.service';
import type { RuntimeFilesystemBackend } from '../../../src/execution/runtime/runtime-filesystem-backend.types';
import { RuntimeSessionEnvironmentService } from '../../../src/execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../../src/execution/runtime/runtime-tool-backend.service';
import { RuntimeToolPermissionService } from '../../../src/execution/runtime/runtime-tool-permission.service';
import { SkillRegistryService } from '../../../src/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/execution/skill/skill-tool.service';
import { TodoToolService } from '../../../src/execution/todo/todo-tool.service';
import { WebFetchToolService } from '../../../src/execution/webfetch/webfetch-tool.service';
import { WriteToolService } from '../../../src/execution/write/write-tool.service';
import { BuiltinPluginRegistryService } from '../../../src/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { PersonaService } from '../../../src/persona/persona.service';
import { PersonaStoreService } from '../../../src/persona/persona-store.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/runtime/gateway/runtime-gateway-remote-transport.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from '../../../src/runtime/host/runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from '../../../src/runtime/host/runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from '../../../src/runtime/host/runtime-host-plugin-runtime.service';
import { RuntimeHostRuntimeToolService } from '../../../src/runtime/host/runtime-host-runtime-tool.service';
import { RuntimeHostService } from '../../../src/runtime/host/runtime-host.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentSessionStoreService } from '../../../src/runtime/host/runtime-host-subagent-session-store.service';
import { RuntimeHostSubagentStoreService } from '../../../src/runtime/host/runtime-host-subagent-store.service';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';
import { RuntimePluginGovernanceService } from '../../../src/runtime/kernel/runtime-plugin-governance.service';
import { ToolRegistryService } from '../../../src/execution/tool/tool-registry.service';

const runtimeWorkspaceRoots: string[] = [];
const originalRuntimeWorkspaceRoot = process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;

describe('ToolRegistryService', () => {
  afterEach(() => {
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = originalRuntimeWorkspaceRoot;
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (!nextRoot) {
        continue;
      }
      fs.rmSync(nextRoot, { force: true, recursive: true });
    }
  });

  it('lists plugin tool sources and tool records', async () => {
    const { service } = createFixture();

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          id: 'builtin.memory-tools',
          kind: 'plugin',
          totalTools: 2,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'plugin:builtin.memory-tools:save_memory',
        }),
        expect.objectContaining({
          toolId: 'plugin:builtin.memory-tools:search_memory',
        }),
      ]),
    }));
  });

  it('lists MCP tool sources and tool records', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });

    await expect(service.listOverview()).resolves.toEqual(expect.objectContaining({
      sources: expect.arrayContaining([
        expect.objectContaining({
          kind: 'mcp',
          id: 'weather',
          totalTools: 1,
        }),
      ]),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'mcp:weather:get_forecast',
          sourceKind: 'mcp',
          sourceId: 'weather',
          parameters: {
            city: {
              type: 'string',
              required: true,
              description: 'City name',
            },
          },
        }),
      ]),
    }));
  });

  it('includes native skill tool in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toContain('skill');
  });

  it('includes native todowrite, webfetch, bash, read, glob, grep, write and edit tools in the executable tool set', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual(expect.arrayContaining([
      'todowrite',
      'webfetch',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
    ]));
  });

  it('updates source and tool enabled flags and dispatches plugin source actions', async () => {
    const { runtimePluginGovernanceService, service } = createFixture();
    runtimePluginGovernanceService.runPluginAction = jest.fn().mockImplementation(async ({ action, pluginId }) => ({
      accepted: true,
      action,
      pluginId,
      message: action === 'health-check' ? '插件健康检查通过' : '已重新装载本地插件',
    })) as never;

    await expect(
      service.setSourceEnabled('plugin', 'builtin.memory-tools', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        id: 'builtin.memory-tools',
      }),
    );
    await expect(
      service.setToolEnabled('plugin:builtin.memory-tools:save_memory', false),
    ).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        toolId: 'plugin:builtin.memory-tools:save_memory',
      }),
    );
    await expect(
      service.runSourceAction('plugin', 'builtin.memory-tools', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: '插件健康检查通过',
    });
    await expect(
      service.runSourceAction('plugin', 'builtin.memory-tools', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: '已重新装载本地插件',
    });
  });

  it('updates MCP source enabled flags and dispatches MCP source actions', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [],
    });
    mcpService.setServerEnabled.mockResolvedValue(undefined);
    mcpService.runGovernanceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });

    await expect(service.setSourceEnabled('mcp', 'weather', false)).resolves.toEqual(
      expect.objectContaining({
        kind: 'mcp',
        id: 'weather',
      }),
    );
    await expect(service.runSourceAction('mcp', 'weather', 'health-check')).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });
    expect(mcpService.setServerEnabled).toHaveBeenCalledWith('weather', false);
  });

  it('filters out tools disabled for the current conversation scope', async () => {
    const { pluginBootstrapService, service } = createFixture();
    const builtinPersisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    builtinPersisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('builtin.memory-tools'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      lastSeenAt: new Date().toISOString(),
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      governance: {
        defaultEnabled: false,
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索记忆',
            name: 'search_memory',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      ...pluginBootstrapService.getPlugin('remote.memory-tools'),
      connected: true,
      conversationScopes: {
        'conversation-1': false,
        'conversation-2': true,
      },
      defaultEnabled: false,
      lastSeenAt: new Date().toISOString(),
    });

    await expect(service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    })).resolves.toEqual(expect.objectContaining({
      skill: expect.any(Object),
    }));

    const enabledTools = await service.buildToolSet({
      context: {
        conversationId: 'conversation-2',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(enabledTools).toBeDefined();
    expect(Object.keys(enabledTools ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
    ]);
  });

  it('includes builtin tools in the executable tool set when enabled', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual([
      'save_memory',
      'search_memory',
      'bash',
      'read',
      'glob',
      'grep',
      'write',
      'edit',
      'todowrite',
      'webfetch',
      'skill',
      'invalid',
    ]);
  });

  it('does not expose internal invalid tool in the available tool summary list', async () => {
    const { service } = createFixture();

    const tools = await service.listAvailableTools({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(tools.map((entry) => entry.name)).not.toContain('invalid');
  });

  it('dispatches native webfetch tool execution through the webfetch owner', async () => {
    const { service, webFetchService } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();
    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-1',
    });

    expect(result).toEqual(expect.objectContaining({
      format: 'markdown',
      title: 'Smoke Example',
      url: 'https://example.com/smoke',
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<webfetch_result>'),
    }));
    expect(webFetchService.fetch).toHaveBeenCalledWith({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
  });

  it('dispatches native bash tool execution through the runtime owner and persists workspace files', async () => {
    const { conversationId, runtimeToolPermissionService, service, runtimeWorkspaceRoot } = createFixture();

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-allow-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const writeExecution = (bashTool as any).execute({
      command: buildRuntimeShellPersistAndReadCommand('logs/run.txt', 'persisted'),
      description: '写入并校验运行日志',
    });
    const writeRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(writeRequest).toMatchObject({
      messageId: 'assistant-message-allow-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, writeRequest.id, 'once');
    const writeResult = await writeExecution;

    const readExecution = (bashTool as any).execute({
      command: buildRuntimeShellReadCommand('logs/run.txt'),
      description: '读取刚才的运行日志',
    });
    const readRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(readRequest).toMatchObject({
      messageId: 'assistant-message-allow-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, readRequest.id, 'once');
    const readResult = await readExecution;
    const modelOutput = await (bashTool as any).toModelOutput({
      input: { command: buildRuntimeShellReadCommand('logs/run.txt'), description: '读取刚才的运行日志' },
      output: readResult,
      toolCallId: 'call-bash-1',
    });

    expect(writeResult).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('persisted'),
    }));
    expect(readResult).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('persisted'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<bash_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('cwd: /');
    expect((modelOutput as { value: string }).value).not.toContain('backend:');
    expect(
      fs.readFileSync(path.join(runtimeWorkspaceRoot, conversationId, 'logs', 'run.txt'), 'utf8').replace(/\r\n/g, '\n'),
    ).toBe('persisted\n');
  });

  it('applies builtin runtime-tools bash output config through the plugin config chain', async () => {
    const { conversationId, pluginBootstrapService, runtimeToolPermissionService, service } = createFixture();
    const pluginPersistenceService = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    pluginPersistenceService.updatePluginConfig('builtin.runtime-tools', {
      bashOutput: {
        maxLines: 2,
        showTruncationDetails: false,
      },
    });

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-allow-2',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: buildRuntimeShellMultilineOutputCommand(['line-1', 'line-2', 'line-3', 'line-4']),
      description: '生成多行输出',
    });
    const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    runtimeToolPermissionService.reply(conversationId, request.id, 'once');
    const result = await execution;

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('<bash_result>'),
    }));
    expect((result as { value: string }).value).toContain('<stdout>\nline-3\nline-4\n</stdout>');
    expect((result as { value: string }).value).not.toContain('output truncated');
    expect((result as { value: string }).value).not.toContain('line-2\nline-3');
  });

  it('routes builtin runtime-tools bash execution through the configured shell backend', async () => {
    const { conversationId, pluginBootstrapService, runtimeToolPermissionService, service } = createFixture();
    const pluginPersistenceService = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    pluginPersistenceService.updatePluginConfig('builtin.runtime-tools', {
      shellBackend: 'native-shell',
    });

    const toolSet = await service.buildToolSet({
      assistantMessageId: 'assistant-message-shell-config-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'echo configured-backend',
      description: '验证配置指定 shell backend',
    });
    const request = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(request).toMatchObject({
      backendKind: 'native-shell',
      messageId: 'assistant-message-shell-config-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, request.id, 'once');
    const result = await execution;

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('configured-backend'),
    }));
  });

  it('keeps bash description on stable workspace semantics instead of backend governance details', async () => {
    const { service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['bash'],
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    expect((bashTool as { description: string }).description).toContain('在当前 session 的执行后端中执行命令');
    expect((bashTool as { description: string }).description).toContain('同一 session 下写入 backend 当前可见路径的文件');
    expect((bashTool as { description: string }).description).not.toContain('当前默认 runtime 后端');
    expect((bashTool as { description: string }).description).not.toContain('宿主工作区');
    expect((bashTool as { description: string }).description).not.toContain('权限审批');
  });

  it('requires runtime approval before executing native bash tool', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: buildRuntimeShellPwdCommand(),
      description: '查看当前工作目录',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('attaches static shell hints to bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd nested && cat logs/run.txt && rm logs/old.txt',
      description: '检查 bash 审批提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-hints-1',
      metadata: {
        command: 'cd nested && cat logs/run.txt && rm logs/old.txt',
        commandHints: {
          fileCommands: ['cd', 'cat', 'rm'],
          usesCd: true,
        },
        description: '检查 bash 审批提示',
      },
      summary: '检查 bash 审批提示 (/)；静态提示: 含 cd、文件命令: cd, cat, rm',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces redundant cd hint when bash workdir is already provided', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-workdir-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd nested && cat app.txt',
      description: '检查 bash workdir 提示',
      workdir: 'nested',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-workdir-hints-1',
      metadata: {
        command: 'cd nested && cat app.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          redundantCdWithWorkdir: true,
          usesCd: true,
        },
        description: '检查 bash workdir 提示',
        workdir: 'nested',
      },
      summary: '检查 bash workdir 提示 (nested)；静态提示: 含 cd、已提供 workdir，命令里仍含 cd、文件命令: cd, cat',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces parent traversal hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-parent-traversal-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cd .. && cat ../notes.txt',
      description: '检查 bash 上级目录提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-parent-traversal-hints-1',
      metadata: {
        command: 'cd .. && cat ../notes.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          parentTraversalPaths: ['..', '../notes.txt'],
          usesCd: true,
          usesParentTraversal: true,
        },
        description: '检查 bash 上级目录提示',
      },
      summary: '检查 bash 上级目录提示 (/)；静态提示: 含 cd、相对上级路径: .., ../notes.txt、文件命令: cd, cat',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces network command hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-network-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh',
      description: '检查 bash 联网提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-network-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh',
        commandHints: {
          networkCommands: ['curl'],
          usesNetworkCommand: true,
        },
        description: '检查 bash 联网提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash 联网提示 (/)；静态提示: 联网命令: curl',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces powershell native network command hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-ps-network-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'iwr https://example.com/api; irm https://example.com/data',
      description: '检查 bash powershell 联网提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-ps-network-hints-1',
      metadata: {
        command: 'iwr https://example.com/api; irm https://example.com/data',
        commandHints: {
          networkCommands: ['invoke-webrequest', 'invoke-restmethod'],
          usesNetworkCommand: true,
        },
        description: '检查 bash powershell 联网提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash powershell 联网提示 (/)；静态提示: 联网命令: invoke-webrequest, invoke-restmethod',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces combined network and external-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-network-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh -o ~/install.sh',
      description: '检查 bash 联网外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-network-external-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh -o ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash 联网外部路径提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash 联网外部路径提示 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces curl output external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-output-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
      description: '检查 bash curl output 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-output-external-hints-1',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash curl output 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl output 外部写入提示 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces wget output-document external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-output-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget -O ~/install.sh https://example.com/install.sh',
      description: '检查 bash wget 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-output-external-hints-1',
      metadata: {
        command: 'wget -O ~/install.sh https://example.com/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash wget 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 外部写入提示 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface lowercase wget -p as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-lowercase-p-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget -p ~/downloads https://example.com/index.html',
      description: '检查 bash wget 短参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-lowercase-p-hints-1',
      metadata: {
        command: 'wget -p ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash wget 短参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 短参数大小写 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface uppercase curl --Output as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-uppercase-output-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl --Output ~/download.txt https://example.com/file.txt',
      description: '检查 bash curl 长参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-uppercase-output-hints-1',
      metadata: {
        command: 'curl --Output ~/download.txt https://example.com/file.txt',
        commandHints: {
          absolutePaths: ['~/download.txt'],
          externalAbsolutePaths: ['~/download.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash curl 长参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl 长参数大小写 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/download.txt、外部绝对路径: ~/download.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface mixed-case wget --Directory-Prefix as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-wget-mixedcase-directory-prefix-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
      description: '检查 bash wget 长参数大小写',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-wget-mixedcase-directory-prefix-hints-1',
      metadata: {
        command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash wget 长参数大小写',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash wget 长参数大小写 (/)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git clone external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-clone-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git clone https://example.com/repo.git ~/repo-copy',
      description: '检查 bash git clone 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-clone-external-hints-1',
      metadata: {
        command: 'git clone https://example.com/repo.git ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash git clone 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash git clone 外部写入提示 (/)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: ~/repo-copy、写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git clone separate git dir as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-clone-separate-git-dir-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git clone --separate-git-dir ~/repo.git https://example.com/repo.git',
      description: '检查 bash git clone 单独 git 目录提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-clone-separate-git-dir-hints-1',
      metadata: {
        command: 'git clone --separate-git-dir ~/repo.git https://example.com/repo.git',
        commandHints: {
          absolutePaths: ['~/repo.git'],
          externalAbsolutePaths: ['~/repo.git'],
          externalWritePaths: ['~/repo.git'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash git clone 单独 git 目录提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash git clone 单独 git 目录提示 (/)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: ~/repo.git、写入命令涉及外部绝对路径: ~/repo.git、外部绝对路径: ~/repo.git',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git init external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-init-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git init ~/repo-copy',
      description: '检查 bash git init 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-init-external-hints-1',
      metadata: {
        command: 'git init ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git init 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git init 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git init destination as external write without promoting template path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-init-template-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git init --template ~/template-dir ~/repo-copy',
      description: '检查 bash git init 模板参数误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-init-template-hints-1',
      metadata: {
        command: 'git init --template ~/template-dir ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/template-dir', '~/repo-copy'],
          externalAbsolutePaths: ['~/template-dir', '~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git init 模板参数误报',
      },
      operations: ['command.execute'],
      summary: '检查 bash git init 模板参数误报 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/template-dir, ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git archive output file as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-archive-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git archive --output ~/repo.tar HEAD',
      description: '检查 bash git archive 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-archive-external-hints-1',
      metadata: {
        command: 'git archive --output ~/repo.tar HEAD',
        commandHints: {
          absolutePaths: ['~/repo.tar'],
          externalAbsolutePaths: ['~/repo.tar'],
          externalWritePaths: ['~/repo.tar'],
          writesExternalPath: true,
        },
        description: '检查 bash git archive 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git archive 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo.tar、外部绝对路径: ~/repo.tar',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git bundle create output file as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-bundle-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git bundle create ~/repo.bundle HEAD',
      description: '检查 bash git bundle 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-bundle-external-hints-1',
      metadata: {
        command: 'git bundle create ~/repo.bundle HEAD',
        commandHints: {
          absolutePaths: ['~/repo.bundle'],
          externalAbsolutePaths: ['~/repo.bundle'],
          externalWritePaths: ['~/repo.bundle'],
          writesExternalPath: true,
        },
        description: '检查 bash git bundle 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git bundle 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo.bundle、外部绝对路径: ~/repo.bundle',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git format-patch output directory as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-format-patch-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git format-patch --output-directory ~/patches HEAD~2',
      description: '检查 bash git format-patch 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-format-patch-external-hints-1',
      metadata: {
        command: 'git format-patch --output-directory ~/patches HEAD~2',
        commandHints: {
          absolutePaths: ['~/patches'],
          externalAbsolutePaths: ['~/patches'],
          externalWritePaths: ['~/patches'],
          writesExternalPath: true,
        },
        description: '检查 bash git format-patch 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git format-patch 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/patches、外部绝对路径: ~/patches',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces tar create archive file as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-tar-create-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'tar -cf ~/archive.tar /workspace/source.txt',
      description: '检查 bash tar create 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-tar-create-external-hints-1',
      metadata: {
        command: 'tar -cf ~/archive.tar /workspace/source.txt',
        commandHints: {
          absolutePaths: ['~/archive.tar', '/workspace/source.txt'],
          externalAbsolutePaths: ['~/archive.tar'],
          externalWritePaths: ['~/archive.tar'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 bash tar create 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash tar create 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/archive.tar、文件命令: tar、外部绝对路径: ~/archive.tar',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces tar extract directory as external write without promoting archive input', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-tar-extract-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'tar -xf /workspace/archive.tar -C ~/output',
      description: '检查 bash tar extract 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-tar-extract-external-hints-1',
      metadata: {
        command: 'tar -xf /workspace/archive.tar -C ~/output',
        commandHints: {
          absolutePaths: ['/workspace/archive.tar', '~/output'],
          externalAbsolutePaths: ['~/output'],
          externalWritePaths: ['~/output'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 bash tar extract 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash tar extract 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/output、文件命令: tar、外部绝对路径: ~/output',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cp destination as external write without promoting source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cp-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cp /workspace/source.txt ~/copied.txt',
      description: '检查 bash cp 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cp-external-hints-1',
      metadata: {
        command: 'cp /workspace/source.txt ~/copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/source.txt', '~/copied.txt'],
          externalAbsolutePaths: ['~/copied.txt'],
          externalWritePaths: ['~/copied.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash cp 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash cp 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/copied.txt、文件命令: cp、外部绝对路径: ~/copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mv destination as external write without promoting source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mv-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mv /workspace/source.txt ~/moved.txt',
      description: '检查 bash mv 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mv-external-hints-1',
      metadata: {
        command: 'mv /workspace/source.txt ~/moved.txt',
        commandHints: {
          absolutePaths: ['/workspace/source.txt', '~/moved.txt'],
          externalAbsolutePaths: ['~/moved.txt'],
          externalWritePaths: ['~/moved.txt'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 bash mv 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash mv 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/moved.txt、文件命令: mv、外部绝对路径: ~/moved.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cp target-directory as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cp-target-directory-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cp -t ~/copied-dir /workspace/source-a.txt /workspace/source-b.txt',
      description: '检查 bash cp target-directory 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cp-target-directory-hints-1',
      metadata: {
        command: 'cp -t ~/copied-dir /workspace/source-a.txt /workspace/source-b.txt',
        commandHints: {
          absolutePaths: ['~/copied-dir', '/workspace/source-a.txt', '/workspace/source-b.txt'],
          externalAbsolutePaths: ['~/copied-dir'],
          externalWritePaths: ['~/copied-dir'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash cp target-directory 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash cp target-directory 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/copied-dir、文件命令: cp、外部绝对路径: ~/copied-dir',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mv target-directory as external write without promoting source paths', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mv-target-directory-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mv --target-directory ~/moved-dir /workspace/source-a.txt /workspace/source-b.txt',
      description: '检查 bash mv target-directory 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mv-target-directory-hints-1',
      metadata: {
        command: 'mv --target-directory ~/moved-dir /workspace/source-a.txt /workspace/source-b.txt',
        commandHints: {
          absolutePaths: ['~/moved-dir', '/workspace/source-a.txt', '/workspace/source-b.txt'],
          externalAbsolutePaths: ['~/moved-dir'],
          externalWritePaths: ['~/moved-dir'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 bash mv target-directory 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash mv target-directory 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/moved-dir、文件命令: mv、外部绝对路径: ~/moved-dir',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git worktree add external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-worktree-add-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git worktree add -b feature ~/repo-copy main',
      description: '检查 bash git worktree 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-worktree-add-external-hints-1',
      metadata: {
        command: 'git worktree add -b feature ~/repo-copy main',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git worktree 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git worktree 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces git submodule add external destination as an external write in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-git-submodule-add-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'git submodule add https://example.com/repo.git ~/repo-copy',
      description: '检查 bash git submodule 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-git-submodule-add-external-hints-1',
      metadata: {
        command: 'git submodule add https://example.com/repo.git ~/repo-copy',
        commandHints: {
          absolutePaths: ['~/repo-copy'],
          externalAbsolutePaths: ['~/repo-copy'],
          externalWritePaths: ['~/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 bash git submodule 外部写入提示',
      },
      operations: ['command.execute'],
      summary: '检查 bash git submodule 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: ~/repo-copy、外部绝对路径: ~/repo-copy',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces scp destination external write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-scp-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'scp user@example.com:/var/log/app.log ~/app.log',
      description: '检查 bash scp 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-scp-external-hints-1',
      metadata: {
        command: 'scp user@example.com:/var/log/app.log ~/app.log',
        commandHints: {
          absolutePaths: ['~/app.log'],
          externalAbsolutePaths: ['~/app.log'],
          externalWritePaths: ['~/app.log'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash scp 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash scp 外部写入提示 (/)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: ~/app.log、写入命令涉及外部绝对路径: ~/app.log、外部绝对路径: ~/app.log',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface curl upload-file local input paths as external writes in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-curl-upload-input-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'curl --upload-file ~/input.txt https://example.com/upload',
      description: '检查 bash curl upload-file 误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-curl-upload-input-hints-1',
      metadata: {
        command: 'curl --upload-file ~/input.txt https://example.com/upload',
        commandHints: {
          absolutePaths: ['~/input.txt'],
          externalAbsolutePaths: ['~/input.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash curl upload-file 误报',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash curl upload-file 误报 (/)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/input.txt、外部绝对路径: ~/input.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('does not surface scp local source paths as external writes in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-scp-local-source-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'scp ~/input.txt user@example.com:/var/log/app.log',
      description: '检查 bash scp 本地源文件误报',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-scp-local-source-hints-1',
      metadata: {
        command: 'scp ~/input.txt user@example.com:/var/log/app.log',
        commandHints: {
          absolutePaths: ['~/input.txt'],
          externalAbsolutePaths: ['~/input.txt'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 bash scp 本地源文件误报',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash scp 本地源文件误报 (/)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: ~/input.txt、外部绝对路径: ~/input.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces external write-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-write-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
      description: '检查 bash 写入外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-write-external-hints-1',
      metadata: {
        command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash 写入外部路径提示',
      },
      summary: '检查 bash 写入外部路径提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces Copy-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-copy-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
      description: '检查 bash Copy-Item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-copy-item-external-hints-1',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Copy-Item 外部写入提示',
      },
      summary: '检查 bash Copy-Item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces cpi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-cpi-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
      description: '检查 bash cpi 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-cpi-external-hints-1',
      metadata: {
        command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-alias.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 bash cpi 外部写入提示',
      },
      summary: '检查 bash cpi 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-alias.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-alias.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces Move-Item destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-move-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
      description: '检查 bash Move-Item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-move-item-external-hints-1',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash Move-Item 外部写入提示',
      },
      summary: '检查 bash Move-Item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces mi destination as external write without promoting external source path', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-mi-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
      description: '检查 bash mi 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-mi-external-hints-1',
      metadata: {
        command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-alias.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 bash mi 外部写入提示',
      },
      summary: '检查 bash mi 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-alias.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-alias.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces redirection write-path hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-redirect-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
      description: '检查 bash 重定向写入外部路径提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-redirect-external-hints-1',
      metadata: {
        command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\redirected.txt'],
          writesExternalPath: true,
        },
        description: '检查 bash 重定向写入外部路径提示',
      },
      summary: '检查 bash 重定向写入外部路径提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\redirected.txt、外部绝对路径: filesystem::C:\\temp\\redirected.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces out-file filepath write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-out-file-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
      description: '检查 bash out-file 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-out-file-external-hints-1',
      metadata: {
        command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['get-content', 'out-file'],
          writesExternalPath: true,
        },
        description: '检查 bash out-file 外部写入提示',
      },
      summary: '检查 bash out-file 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: get-content, out-file、外部绝对路径: filesystem::C:\\temp\\copied.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces new-item path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
      description: '检查 bash new-item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-external-hints-1',
      metadata: {
        command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item 外部写入提示',
      },
      summary: '检查 bash new-item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces rename-item path plus newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
      description: '检查 bash rename-item 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-external-hints-1',
      metadata: {
        command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item 外部写入提示',
      },
      summary: '检查 bash rename-item 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces new-item positional path plus name as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-positional-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
      description: '检查 bash new-item positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-positional-hints-1',
      metadata: {
        command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created-positional.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item positional 外部写入提示',
      },
      summary: '检查 bash new-item positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created-positional.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces rename-item positional path plus positional newname as the external write target in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-positional-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
      description: '检查 bash rename-item positional 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-positional-hints-1',
      metadata: {
        command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed-positional.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item positional 外部写入提示',
      },
      summary: '检查 bash rename-item positional 外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed-positional.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old-positional.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps windows drive separators in new-item external write targets in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-new-item-drive-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
      description: '检查 bash new-item 裸盘符外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-new-item-drive-hints-1',
      metadata: {
        command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-drive.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 bash new-item 裸盘符外部写入提示',
      },
      summary: '检查 bash new-item 裸盘符外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-drive.txt、文件命令: new-item、外部绝对路径: C:\\temp',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps windows drive separators in rename-item external write targets in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-rename-item-drive-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
      description: '检查 bash rename-item 裸盘符外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-rename-item-drive-hints-1',
      metadata: {
        command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-drive.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-drive.txt'],
          externalWritePaths: ['C:\\temp\\renamed-drive.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 bash rename-item 裸盘符外部写入提示',
      },
      summary: '检查 bash rename-item 裸盘符外部写入提示 (/)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-drive.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-drive.txt',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('surfaces invoke-webrequest outfile write hints in bash permission requests', async () => {
    const { conversationId, runtimeToolPermissionService, service } = createFixture();
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-iwr-outfile-external-hints-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();

    const execution = (bashTool as any).execute({
      command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
      description: '检查 bash iwr 外部写入提示',
    });
    const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(pendingRequest).toMatchObject({
      messageId: 'assistant-message-bash-iwr-outfile-external-hints-1',
      metadata: {
        command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalWritePaths: ['filesystem::C:\\temp\\install.ps1'],
          networkCommands: ['invoke-webrequest'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 bash iwr 外部写入提示',
      },
      operations: ['command.execute', 'network.access'],
      summary: '检查 bash iwr 外部写入提示 (/)；静态提示: 联网命令: invoke-webrequest、联网命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、写入命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、外部绝对路径: filesystem::C:\\temp\\install.ps1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'reject');
    await expect(execution).resolves.toEqual(expect.objectContaining({
      error: '用户拒绝了本次 runtime 权限请求',
      phase: 'execute',
      recovered: true,
      tool: 'bash',
      type: 'invalid-tool-result',
    }));
  });

  it('keeps bash workdir and timeout semantics stable through the native tool contract', async () => {
    const { conversationId, runtimeToolPermissionService, runtimeWorkspaceRoot, service } = createFixture();
    const slowServer = http.createServer(async (_request: http.IncomingMessage, response: http.ServerResponse) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('slow-ok');
    });
    await new Promise<void>((resolve, reject) => {
      slowServer.once('error', reject);
      slowServer.listen(0, '127.0.0.1', () => resolve());
    });
    const toolSet = await service.buildToolSet({
      allowedToolNames: ['bash'],
      assistantMessageId: 'assistant-message-bash-runtime-1',
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const bashTool = toolSet?.bash;
    expect(bashTool).toBeDefined();
    fs.mkdirSync(path.join(runtimeWorkspaceRoot, conversationId, 'nested'), { recursive: true });

    const workdirExecution = (bashTool as any).execute({
      command: buildRuntimeShellWorkdirCommand('child.txt', 'from-workdir'),
      description: '在指定目录执行命令',
      workdir: 'nested',
    });
    const workdirRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
    expect(workdirRequest).toMatchObject({
      messageId: 'assistant-message-bash-runtime-1',
      toolName: 'bash',
    });
    runtimeToolPermissionService.reply(conversationId, workdirRequest.id, 'once');
    const workdirResult = await workdirExecution;

    expect(workdirResult).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('cwd: /nested'),
    }));
    expect((workdirResult as { value: string }).value).toContain('from-workdir');

    try {
      const address = slowServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to allocate slow test server port');
      }
      const timeoutExecution = (bashTool as any).execute({
        command: buildRuntimeShellHttpReadCommand(`http://127.0.0.1:${address.port}/slow`),
        description: '触发 bash 超时',
        timeout: 50,
      });
      const timeoutRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(timeoutRequest).toMatchObject({
        messageId: 'assistant-message-bash-runtime-1',
        toolName: 'bash',
      });
      runtimeToolPermissionService.reply(conversationId, timeoutRequest.id, 'once');
      await expect(timeoutExecution).resolves.toEqual(expect.objectContaining({
        error: 'bash 执行超时（>1 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。',
        phase: 'execute',
        recovered: true,
        tool: 'bash',
        type: 'invalid-tool-result',
      }));
    } finally {
      await new Promise<void>((resolve, reject) => {
        slowServer.close((error?: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('routes bash execution to the configured shell backend without changing tool contract', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'mock-shell';
    try {
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: [
          createMockRuntimeBackend('just-bash'),
          createMockRuntimeBackend('mock-shell'),
        ],
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.bash;
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: 'echo routed',
        description: '验证 shell backend 路由',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest?.backendKind).toBe('mock-shell');
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('mock-shell:echo routed'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes bash execution to the real native-shell backend', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'native-shell';
    try {
      const { conversationId, runtimeToolPermissionService, service } = createFixture({
        runtimeBackends: createRealRuntimeBackendsForShellRouting(),
      });
      const toolSet = await service.buildToolSet({
        assistantMessageId: 'assistant-message-shell-route-native-1',
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['bash'],
      });
      const bashTool = toolSet?.bash;
      expect(bashTool).toBeDefined();

      const execution = (bashTool as any).execute({
        command: buildRuntimeShellEchoCommand('native-shell-ok'),
        description: '验证 native-shell backend 路由',
      });
      const pendingRequest = await waitForPendingRuntimeRequest(runtimeToolPermissionService, conversationId);
      expect(pendingRequest?.backendKind).toBe('native-shell');
      runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
      await expect(execution).resolves.toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('native-shell-ok'),
      }));
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('routes filesystem tool execution to the configured filesystem backend without changing tool contract', async () => {
    const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'mock-filesystem';
    try {
      const { conversationId, service } = createFixture({
        runtimeFilesystemBackends: [
          createMockFilesystemBackend('host-filesystem'),
          createMockFilesystemBackend('mock-filesystem'),
        ],
      });
      const toolSet = await service.buildToolSet({
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['read'],
      });
      const readTool = toolSet?.read;
      expect(readTool).toBeDefined();

      const result = await (readTool as any).execute({
        filePath: 'ignored.txt',
      });

      expect(result).toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('/mock-filesystem.txt'),
      }));
      expect((result as { value: string }).value).toContain('1: mock-filesystem line');
      expect((result as { value: string }).value).toContain('(end of file, total lines: 2, total bytes:');
    } finally {
      if (originalFilesystemBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
      }
    }
  });

  it('routes glob, grep, write and edit to the configured filesystem backend', async () => {
    const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'mock-filesystem';
    try {
      const { conversationId, service } = createFixture({
        runtimeFilesystemBackends: [
          createMockFilesystemBackend('host-filesystem'),
          createMockFilesystemBackend('mock-filesystem'),
        ],
      });
      const toolSet = await service.buildToolSet({
        context: {
          conversationId,
          source: 'plugin',
          userId: 'user-1',
        },
        allowedToolNames: ['glob', 'grep', 'write', 'edit'],
      });

      const globResult = await (toolSet?.glob as any).execute({
        pattern: '*.txt',
      });
      const grepResult = await (toolSet?.grep as any).execute({
        pattern: 'mock-filesystem',
      });
      const writeResult = await (toolSet?.write as any).execute({
        content: 'created by mock filesystem backend',
        filePath: 'notes/output.txt',
      });
      const editResult = await (toolSet?.edit as any).execute({
        filePath: 'notes/output.txt',
        newString: 'updated',
        oldString: 'created',
      });

      expect((globResult as { value: string }).value).toContain('/mock-filesystem.txt');
      expect((grepResult as { value: string }).value).toContain('/mock-filesystem.txt:');
      expect((grepResult as { value: string }).value).toContain('1: mock-filesystem line');
      expect(writeResult).toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('/mock-filesystem/notes/output.txt'),
      }));
      expect(editResult).toEqual(expect.objectContaining({
        kind: 'tool:text',
        value: expect.stringContaining('/mock-filesystem/notes/output.txt'),
      }));
    } finally {
      if (originalFilesystemBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
      }
    }
  });

  it('dispatches native read tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'line one\nline two\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['read'],
    });
    const readTool = toolSet?.read;
    expect(readTool).toBeDefined();

    const result = await (readTool as any).execute({
      filePath: 'notes/runtime.txt',
      limit: 1,
      offset: 1,
    });
    const modelOutput = await (readTool as any).toModelOutput({
      input: { filePath: 'notes/runtime.txt', limit: 1, offset: 1 },
      output: result,
      toolCallId: 'call-read-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/notes/runtime.txt'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<read_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('1: line one');
  });

  it('dispatches native glob tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'smoke-workspace\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'guide.md'), '# smoke\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['glob'],
    });
    const globTool = toolSet?.glob;
    expect(globTool).toBeDefined();

    const result = await (globTool as any).execute({
      path: '/',
      pattern: '**/*.txt',
    });
    const modelOutput = await (globTool as any).toModelOutput({
      input: { path: '/', pattern: '**/*.txt' },
      output: result,
      toolCallId: 'call-glob-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/notes/runtime.txt'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<glob_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('/notes/runtime.txt');
  });

  it('dispatches native grep tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'notes'), { recursive: true });
    fs.mkdirSync(path.join(workspaceRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'notes', 'runtime.txt'), 'smoke-workspace\nsecondary line\n', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'docs', 'guide.md'), '# smoke\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['grep'],
    });
    const grepTool = toolSet?.grep;
    expect(grepTool).toBeDefined();

    const result = await (grepTool as any).execute({
      include: '*.txt',
      path: '/',
      pattern: 'smoke-workspace',
    });
    const modelOutput = await (grepTool as any).toModelOutput({
      input: { include: '*.txt', path: '/', pattern: 'smoke-workspace' },
      output: result,
      toolCallId: 'call-grep-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/notes/runtime.txt:'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<grep_result>'),
    }));
    expect((modelOutput as { value: string }).value).toContain('/notes/runtime.txt:');
    expect((modelOutput as { value: string }).value).toContain('1: smoke-workspace');
  });

  it('dispatches native write tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['write'],
    });
    const writeTool = toolSet?.write;
    expect(writeTool).toBeDefined();
    expect(typeof (writeTool as any).execute).toBe('function');
    const wrappedResult = await (writeTool as any).execute({
      content: 'generated file\n',
      filePath: 'generated/output.txt',
    });

    const modelOutput = await (writeTool as any).toModelOutput({
      input: { content: 'generated file\n', filePath: 'generated/output.txt' },
      output: wrappedResult,
      toolCallId: 'call-write-1',
    });

    expect(wrappedResult).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/generated/output.txt'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<write_result>'),
    }));
    expect(fs.readFileSync(path.join(runtimeWorkspaceRoot, conversationId, 'generated', 'output.txt'), 'utf8')).toBe('generated file\n');
  });

  it('dispatches native edit tool execution through the runtime workspace owner', async () => {
    const { conversationId, service, runtimeWorkspaceRoot } = createFixture();
    const workspaceRoot = path.join(runtimeWorkspaceRoot, conversationId);
    fs.mkdirSync(path.join(workspaceRoot, 'generated'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'generated file\n', 'utf8');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['edit'],
    });
    const editTool = toolSet?.edit;
    expect(editTool).toBeDefined();

    const result = await (editTool as any).execute({
      filePath: 'generated/output.txt',
      newString: 'updated file',
      oldString: 'generated file',
    });
    const modelOutput = await (editTool as any).toModelOutput({
      input: { filePath: 'generated/output.txt', newString: 'updated file', oldString: 'generated file' },
      output: result,
      toolCallId: 'call-edit-1',
    });

    expect(result).toEqual(expect.objectContaining({
      kind: 'tool:text',
      value: expect.stringContaining('/generated/output.txt'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<edit_result>'),
    }));
    expect(fs.readFileSync(path.join(workspaceRoot, 'generated', 'output.txt'), 'utf8')).toBe('updated file\n');
  });

  it('converts recoverable tool execution errors into internal invalid results', async () => {
    const { service, webFetchService } = createFixture();
    webFetchService.fetch.mockRejectedValueOnce(new Error('request timeout'));

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['webfetch'],
    });
    const webFetchTool = toolSet?.webfetch;
    expect(webFetchTool).toBeDefined();

    const result = await (webFetchTool as any).execute({
      format: 'markdown',
      url: 'https://example.com/smoke',
    });
    const modelOutput = await (webFetchTool as any).toModelOutput({
      input: {
        format: 'markdown',
        url: 'https://example.com/smoke',
      },
      output: result,
      toolCallId: 'call-webfetch-failed-1',
    });

    expect(result).toEqual({
      error: 'request timeout',
      inputText: JSON.stringify({
        format: 'markdown',
        url: 'https://example.com/smoke',
      }, null, 2),
      phase: 'execute',
      recovered: true,
      tool: 'webfetch',
      type: 'invalid-tool-result',
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<invalid_tool_result>'),
    }));
  });

  it('includes MCP tools in the executable tool set and dispatches execution through McpService', async () => {
    const { mcpService, service } = createFixture();
    mcpService.getToolingSnapshot.mockReturnValue({
      statuses: [
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
      tools: [
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: 'Get forecast',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
            },
            required: ['city'],
          },
        },
      ],
    });
    mcpService.callTool.mockResolvedValue({ forecast: 'sunny' });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });
    const mcpTool = toolSet?.weather__get_forecast;
    expect(mcpTool).toBeDefined();
    const result = await (mcpTool as any).execute({ city: 'Shanghai' });

    expect(Object.keys(toolSet ?? {})).toContain('weather__get_forecast');
    expect(result).toEqual({ forecast: 'sunny' });
    expect(mcpService.callTool).toHaveBeenCalledWith({
      arguments: { city: 'Shanghai' },
      serverName: 'weather',
      toolName: 'get_forecast',
    });
  });

  it('dispatches native skill tool execution through the skill owner', async () => {
    const { service, skillRegistryService } = createFixture();
    skillRegistryService.getSkillByName.mockResolvedValue({
      id: 'project/weather-query',
      name: 'weather-query',
      description: '查询指定地点天气。',
      content: '# weather-query\n\n请先确认地点，再查询天气。',
      entryPath: 'weather-query/SKILL.md',
      governance: { loadPolicy: 'allow' },
      promptPreview: '请先确认地点，再查询天气。',
      sourceKind: 'project',
      tags: [],
      assets: [{ path: 'scripts/weather.js', kind: 'script', textReadable: true, executable: true }],
    });

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['skill'],
    });
    const skillTool = toolSet?.skill;
    expect(skillTool).toBeDefined();
    const result = await (skillTool as any).execute({ name: 'weather-query' });
    const modelOutput = await (skillTool as any).toModelOutput({
      input: { name: 'weather-query' },
      output: result,
      toolCallId: 'call-skill-1',
    });

    expect(result).toEqual(expect.objectContaining({
      name: 'weather-query',
      entryPath: 'weather-query/SKILL.md',
      modelOutput: expect.stringContaining('<skill_content name="weather-query">'),
    }));
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<skill_content name="weather-query">'),
    }));
    expect(skillRegistryService.getSkillByName).toHaveBeenCalledWith('weather-query');
  });

  it('dispatches native todowrite tool execution through the session todo owner', async () => {
    const { conversationId, runtimeHostConversationRecordService, service } = createFixture();

    const toolSet = await service.buildToolSet({
      context: {
        conversationId,
        source: 'plugin',
        userId: 'user-1',
      },
      allowedToolNames: ['todowrite'],
    });
    const todoTool = toolSet?.todowrite;
    expect(todoTool).toBeDefined();
    const todos = [
      { content: '分析现有实现', priority: 'high' as const, status: 'completed' as const },
      { content: '实现 todo 工具', priority: 'high' as const, status: 'in_progress' as const },
    ];
    const result = await (todoTool as any).execute({ todos });
    const modelOutput = await (todoTool as any).toModelOutput({
      input: { todos },
      output: result,
      toolCallId: 'call-todo-1',
    });

    expect(result).toEqual({
      sessionId: conversationId,
      pendingCount: 1,
      todos,
    });
    expect(modelOutput).toEqual(expect.objectContaining({
      type: 'text',
      value: expect.stringContaining('<todo_result>'),
    }));
    expect(runtimeHostConversationRecordService.readSessionTodo(conversationId)).toEqual(todos);
  });

  it('excludes disconnected remote plugins from the executable tool set', async () => {
    const { pluginBootstrapService, service } = createFixture();
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.memory-tools',
        name: 'Remote Memory Tools',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: '搜索远端记忆',
            name: 'remote_search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.markPluginOffline('remote.memory-tools');

    const toolSet = await service.buildToolSet({
      context: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(Object.keys(toolSet ?? {})).not.toContain('remote_search');
  });
});

function createFixture(options: {
  runtimeBackends?: RuntimeBackend[];
  runtimeFilesystemBackends?: RuntimeFilesystemBackend[];
} = {}) {
  const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-tool-registry-runtime-'));
  process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;
  runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
  );
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory-tools',
      name: '记忆工具',
      runtime: 'local',
    },
    manifest: {
      permissions: [],
      tools: [
        {
          description: '保存记忆',
          name: 'save_memory',
          parameters: {},
        },
        {
          description: '搜索记忆',
          name: 'search_memory',
          parameters: {},
        },
      ],
      version: '1.0.0',
    } as never,
  });

  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  const runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
  const conversationId = (runtimeHostConversationRecordService.createConversation({
    title: 'Tool Registry Todo',
    userId: 'user-1',
  }) as { id: string }).id;
  const runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
    runtimeHostConversationRecordService,
  );
  const aiModelExecutionService = new AiModelExecutionService();
  const runtimeHostSubagentRunnerService = new RuntimeHostSubagentRunnerService(
    aiModelExecutionService,
    runtimeHostConversationMessageService,
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
      listPlugins: jest.fn().mockReturnValue([]),
    } as never,
    new RuntimeHostSubagentStoreService(),
    new RuntimeHostSubagentSessionStoreService(),
    new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
  );
  jest.spyOn(runtimeHostSubagentRunnerService, 'runSubagent').mockResolvedValue({
    finishReason: 'stop',
    message: {
      content: 'Generated: 请总结当前仓库的技能目录',
      role: 'assistant',
    },
    modelId: 'gpt-5.4',
    providerId: 'openai',
    sessionId: 'subagent-session-1',
    sessionMessageCount: 2,
    text: 'Generated: 请总结当前仓库的技能目录',
    toolCalls: [],
    toolResults: [],
  } as never);
  const runtimeHostAutomationService = new AutomationService(
    new AutomationExecutionService(
      {
        executeTool: jest.fn(),
        invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      {
        sendMessage: async () => {
          throw new Error('RuntimeHostConversationMessageService is not available');
        },
      } as never,
    ),
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const runtimeToolsDefinition = builtinPluginRegistryService.getDefinition('builtin.runtime-tools');
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: runtimeToolsDefinition.manifest.id,
      name: runtimeToolsDefinition.manifest.name,
      runtime: 'local',
    },
    governance: runtimeToolsDefinition.governance,
    manifest: runtimeToolsDefinition.manifest,
  });
  const runtimeHostPluginDispatchService = new RuntimeHostPluginDispatchService(
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayRemoteTransportService,
  );

  const mcpService: {
    callTool: jest.Mock;
    getToolingSnapshot: jest.Mock;
    listToolSources: jest.Mock;
    runGovernanceAction: jest.Mock;
    setServerEnabled: jest.Mock;
  } = {
    callTool: jest.fn(),
    getToolingSnapshot: jest.fn().mockReturnValue({ statuses: [], tools: [] }),
    listToolSources: jest.fn(),
    runGovernanceAction: jest.fn(),
    setServerEnabled: jest.fn(),
  };
  mcpService.listToolSources.mockImplementation(() => buildMcpToolSources(mcpService.getToolingSnapshot()));
  const skillRegistryService = {
    getSkillByName: jest.fn(),
    listSkillSummaries: jest.fn().mockResolvedValue([
      {
        id: 'project/weather-query',
        name: 'weather-query',
        description: '查询指定地点天气。',
        entryPath: 'weather-query/SKILL.md',
        governance: { loadPolicy: 'allow' },
        promptPreview: '请先确认地点，再查询天气。',
        sourceKind: 'project',
        tags: [],
      },
    ]),
    resolveSkillDirectory: jest.fn().mockReturnValue('D:/repo/skills/weather-query'),
  };
  const skillToolService = new SkillToolService(skillRegistryService as unknown as SkillRegistryService);
  const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
  const runtimeHostFilesystemBackendService = new RuntimeHostFilesystemBackendService(
    runtimeSessionEnvironmentService,
  );
  const runtimeBackendRoutingService = new RuntimeBackendRoutingService();
  const runtimeCommandService = new RuntimeCommandService(
    options.runtimeBackends ?? createRealRuntimeBackendsForShellRouting(runtimeSessionEnvironmentService),
    new RuntimeCommandCaptureService(runtimeSessionEnvironmentService),
  );
  const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService(
    options.runtimeFilesystemBackends ?? [runtimeHostFilesystemBackendService],
  );
  const runtimeToolBackendService = new RuntimeToolBackendService(
    runtimeBackendRoutingService,
    runtimeCommandService,
    runtimeFilesystemBackendService,
  );
  const runtimeFileFreshnessService = {
    assertCanWrite: jest.fn().mockResolvedValue(undefined),
    listRecentReads: jest.fn().mockReturnValue([]),
    rememberRead: jest.fn().mockResolvedValue(undefined),
    withFileLock: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
  } as never;
  const runtimeToolPermissionService = new RuntimeToolPermissionService(runtimeHostConversationRecordService);
  const bashToolService = new BashToolService(
    runtimeCommandService,
    runtimeSessionEnvironmentService,
    runtimeToolBackendService,
  );
  const readToolService = new ReadToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const globToolService = new GlobToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
  );
  const grepToolService = new GrepToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
  );
  const writeToolService = new WriteToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const editToolService = new EditToolService(
    runtimeSessionEnvironmentService,
    runtimeFilesystemBackendService,
    runtimeFileFreshnessService,
  );
  const runtimeHostRuntimeToolService = new RuntimeHostRuntimeToolService(
    bashToolService,
    readToolService,
    globToolService,
    grepToolService,
    writeToolService,
    editToolService,
    runtimeToolBackendService,
    runtimeToolPermissionService,
  );
  const runtimeHostService = new RuntimeHostService(
    pluginBootstrapService,
    runtimeHostAutomationService,
    runtimeHostConversationMessageService,
    runtimeHostConversationRecordService,
    aiModelExecutionService as never,
    aiManagementService,
    new RuntimeHostKnowledgeService(),
    runtimeHostPluginDispatchService,
    new RuntimeHostPluginRuntimeService(),
    runtimeHostRuntimeToolService,
    runtimeHostSubagentRunnerService,
    new RuntimeHostUserContextService(),
    new PersonaService(new PersonaStoreService(new ProjectWorktreeRootService()), runtimeHostConversationRecordService),
  );
  runtimeHostService.onModuleInit();
  const runtimePluginGovernanceService = new RuntimePluginGovernanceService(
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
  );
  const invalidToolService = new InvalidToolService();
  const todoToolService = new TodoToolService(runtimeHostConversationRecordService as never);
  const webFetchService = {
    fetch: jest.fn().mockResolvedValue({
      contentType: 'text/html',
      format: 'markdown',
      output: '# Smoke Example\n\nbody',
      status: 200,
      title: 'Smoke Example',
      url: 'https://example.com/smoke',
    }),
  };
  const webFetchToolService = new WebFetchToolService(webFetchService as never);
  return {
    conversationId,
    mcpService,
    pluginBootstrapService,
    runtimeHostConversationRecordService,
    runtimePluginGovernanceService,
    runtimeHostSubagentRunnerService,
    skillRegistryService,
    runtimeToolPermissionService,
    runtimeWorkspaceRoot,
    webFetchService,
    service: new ToolRegistryService(
      mcpService as never,
      invalidToolService,
      todoToolService,
      webFetchToolService,
      skillToolService,
      runtimeHostPluginDispatchService as never,
      runtimePluginGovernanceService as never,
    ),
  };
}

async function waitForPendingRuntimeRequest(
  runtimeToolPermissionService: RuntimeToolPermissionService,
  conversationId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [pendingRequest] = runtimeToolPermissionService.listPendingRequests(conversationId);
    if (pendingRequest) {
      return pendingRequest;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out waiting for runtime permission request: ${conversationId}`);
}

function createMockRuntimeBackend(kind: string): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/',
        exitCode: 0,
        sessionId: input.sessionId,
        stderr: '',
        stdout: `${kind}:${input.command}`,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'ask' as const,
          persistentFilesystem: 'allow' as const,
          persistentShellState: 'deny' as const,
          shellExecution: 'ask' as const,
          workspaceRead: 'allow' as const,
          workspaceWrite: 'allow' as const,
        },
      };
    },
    getKind() {
      return kind;
    },
  };
}

function createRealRuntimeBackendsForShellRouting(
  runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService(),
): RuntimeBackend[] {
  return [
    new RuntimeJustBashService(runtimeSessionEnvironmentService),
    new RuntimeNativeShellService(runtimeSessionEnvironmentService),
  ];
}

function buildRuntimeShellPersistAndReadCommand(filePath: string, content: string): string {
  if (usesRuntimePowerShellBackend()) {
    const normalizedPath = filePath.replace(/\//g, '\\');
    const directoryPath = path.dirname(normalizedPath);
    return [
      `New-Item -ItemType Directory -Force '${escapePowerShellString(directoryPath)}' > $null`,
      `Set-Content -Path '${escapePowerShellString(normalizedPath)}' -Value '${escapePowerShellString(content)}'`,
      `Get-Content '${escapePowerShellString(normalizedPath)}'`,
    ].join('; ');
  }
  return [
    `mkdir -p ${escapeBashSingleQuoted(path.posix.dirname(filePath))}`,
    `printf "${escapeBashDoubleQuoted(content)}\\n" > ${escapeBashSingleQuoted(filePath)}`,
    `cat ${escapeBashSingleQuoted(filePath)}`,
  ].join(' && ');
}

function buildRuntimeShellReadCommand(filePath: string): string {
  if (usesRuntimePowerShellBackend()) {
    return `Get-Content '${escapePowerShellString(filePath.replace(/\//g, '\\'))}'`;
  }
  return `cat ${escapeBashSingleQuoted(filePath)}`;
}

function buildRuntimeShellMultilineOutputCommand(lines: string[]): string {
  if (usesRuntimePowerShellBackend()) {
    return lines
      .map((line) => `Write-Output '${escapePowerShellString(line)}'`)
      .join('; ');
  }
  return `printf "${lines.map((line) => `${escapeBashDoubleQuoted(line)}\\n`).join('')}"`;
}

function buildRuntimeShellPwdCommand(): string {
  return usesRuntimePowerShellBackend()
    ? '(Get-Location).Path'
    : 'pwd';
}

function buildRuntimeShellWorkdirCommand(filePath: string, content: string): string {
  if (usesRuntimePowerShellBackend()) {
    const normalizedPath = filePath.replace(/\//g, '\\');
    return [
      '(Get-Location).Path',
      `Set-Content -Path '${escapePowerShellString(normalizedPath)}' -Value '${escapePowerShellString(content)}'`,
      `Get-Content '${escapePowerShellString(normalizedPath)}'`,
    ].join('; ');
  }
  return `pwd && printf "${escapeBashDoubleQuoted(content)}\\n" > ${escapeBashSingleQuoted(filePath)} && cat ${escapeBashSingleQuoted(filePath)}`;
}

function buildRuntimeShellHttpReadCommand(url: string): string {
  return usesRuntimePowerShellBackend()
    ? `(Invoke-WebRequest -UseBasicParsing '${escapePowerShellString(url)}').Content`
    : `curl -s ${escapeBashSingleQuoted(url)}`;
}

function buildRuntimeShellEchoCommand(text: string): string {
  return usesRuntimePowerShellBackend()
    ? `Write-Output '${escapePowerShellString(text)}'`
    : `printf "${escapeBashDoubleQuoted(text)}\\n"`;
}

function usesRuntimePowerShellBackend(): boolean {
  return process.platform === 'win32' && process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND === 'native-shell';
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeBashSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeBashDoubleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function createMockFilesystemBackend(kind: string): RuntimeFilesystemBackend {
  const backendFileName = `${kind}.txt`;
  const backendVirtualPath = `/${backendFileName}`;
  const backendContent = `${kind} line\nsecond line\n`;
  return {
    async copyPath(_sessionId, fromPath, toPath) {
      return {
        fromPath: fromPath.trim() ? `/${kind}/${fromPath.replace(/^\/+/, '')}` : backendVirtualPath,
        path: toPath.trim() ? `/${kind}/${toPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async createSymlink(_sessionId, input) {
      return {
        path: input.linkPath.trim() ? `/${kind}/${input.linkPath.replace(/^\/+/, '')}` : backendVirtualPath,
        target: input.targetPath,
      };
    },
    async deletePath(_sessionId, inputPath) {
      return {
        deleted: true,
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async editTextFile(_sessionId, input) {
      return {
        diff: {
          additions: kind === 'mock-filesystem' ? 3 : 1,
          afterLineCount: kind === 'mock-filesystem' ? 7 : 2,
          beforeLineCount: kind === 'mock-filesystem' ? 7 : 2,
          deletions: 1,
          patch: `${kind} edit patch`,
        },
        occurrences: kind === 'mock-filesystem'
          ? 7
          : input.replaceAll ? 2 : 1,
        path: input.filePath.trim()
          ? `/${kind}/${input.filePath.replace(/^\/+/, '')}`
          : backendVirtualPath,
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        strategy: kind === 'mock-filesystem' ? 'indentation-flexible' : 'exact',
      };
    },
    async ensureDirectory(_sessionId, inputPath) {
      return {
        created: true,
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async globPaths(_sessionId, input) {
      const normalizedPath = input.path?.trim();
      const resolvedPath = normalizedPath
        ? `/${kind}/${normalizedPath.replace(/^\/+/, '')}`
        : '/';
      return {
        basePath: resolvedPath,
        matches: [backendVirtualPath],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'deny' as const,
          persistentFilesystem: 'allow' as const,
          persistentShellState: 'deny' as const,
          shellExecution: 'deny' as const,
          workspaceRead: 'allow' as const,
          workspaceWrite: 'allow' as const,
        },
      };
    },
    getKind() {
      return kind;
    },
    async grepText() {
      return {
        basePath: '/',
        matches: [
          {
            line: 1,
            text: `${kind} line`,
            virtualPath: backendVirtualPath,
          },
        ],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    async movePath(_sessionId, fromPath, toPath) {
      return {
        fromPath: fromPath.trim() ? `/${kind}/${fromPath.replace(/^\/+/, '')}` : backendVirtualPath,
        path: toPath.trim() ? `/${kind}/${toPath.replace(/^\/+/, '')}` : backendVirtualPath,
      };
    },
    async listFiles() {
      return {
        basePath: '/',
        files: [
          {
            virtualPath: backendVirtualPath,
          },
        ],
      };
    },
    async readDirectoryEntries() {
      return {
        entries: ['routed.txt'],
        path: '/',
      };
    },
    async readPathRange(_sessionId, input) {
      const normalizedPath = input.path?.trim();
      if (!normalizedPath || normalizedPath === '/' || normalizedPath === '.') {
        return {
          entries: ['routed.txt'],
          limit: input.limit,
          offset: input.offset,
          path: '/',
          totalEntries: 1,
          truncated: false,
          type: 'directory' as const,
        };
      }
      return {
        byteLimited: false,
        limit: input.limit,
        lines: backendContent
          .trimEnd()
          .split('\n')
          .slice(input.offset - 1, input.offset - 1 + input.limit),
        mimeType: 'text/plain',
        offset: input.offset,
        path: backendVirtualPath,
        totalBytes: backendContent.length,
        totalLines: 2,
        truncated: false,
        type: 'file' as const,
      };
    },
    async readSymlink(_sessionId, inputPath) {
      return {
        path: inputPath.trim() ? `/${kind}/${inputPath.replace(/^\/+/, '')}` : backendVirtualPath,
        target: backendVirtualPath,
      };
    },
    async resolvePath(_sessionId, inputPath) {
      const normalizedInputPath = typeof inputPath === 'string' ? inputPath.trim() : '';
      if (!normalizedInputPath || normalizedInputPath === '/' || normalizedInputPath === '.') {
        return {
          exists: true,
          type: 'directory' as const,
          virtualPath: '/',
        };
      }
      return {
        exists: true,
        type: 'file' as const,
        virtualPath: backendVirtualPath,
      };
    },
    async statPath(_sessionId, inputPath) {
      const resolved = await this.resolvePath(_sessionId, inputPath);
      return {
        ...resolved,
        mtime: '2026-04-21T00:00:00.000Z',
        size: resolved.type === 'file' ? backendContent.length : 0,
      };
    },
    async readTextFile() {
      return {
        content: backendContent,
        path: backendVirtualPath,
      };
    },
    async writeTextFile(_sessionId, inputPath) {
      return {
        created: true,
        diff: {
          additions: 2,
          afterLineCount: 2,
          beforeLineCount: 0,
          deletions: 0,
          patch: `${kind} write patch`,
        },
        lineCount: 2,
        path: `/${kind}/${inputPath.replace(/^\/+/, '')}`,
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        size: 33,
      };
    },
  };
}

function buildMcpToolSources(snapshot: {
  statuses: Array<{ connected: boolean; enabled: boolean; health: string; lastCheckedAt: string | null; lastError: string | null; name: string }>;
  tools: Array<{ description?: string; inputSchema?: { properties?: Record<string, { description?: string; type?: string }>; required?: string[] } | null; name: string; serverName: string }>;
}) {
  return snapshot.statuses.map((status) => {
    const tools = snapshot.tools
      .filter((tool) => tool.serverName === status.name)
      .map((tool) => ({
        toolId: `mcp:${status.name}:${tool.name}`,
        name: tool.name,
        callName: `${status.name}__${tool.name}`,
        description: tool.description ?? tool.name,
        parameters: Object.fromEntries(Object.entries(tool.inputSchema?.properties ?? {}).map(([key, schema]) => [key, { description: schema.description, required: (tool.inputSchema?.required ?? []).includes(key), type: schema.type === 'number' || schema.type === 'boolean' || schema.type === 'object' || schema.type === 'array' ? schema.type : 'string' }])),
        enabled: status.enabled,
        sourceKind: 'mcp' as const,
        sourceId: status.name,
        sourceLabel: status.name,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
      }));
    return {
      source: {
        kind: 'mcp' as const,
        id: status.name,
        label: status.name,
        enabled: status.enabled,
        health: status.health,
        lastError: status.lastError,
        lastCheckedAt: status.lastCheckedAt,
        totalTools: tools.length,
        enabledTools: status.enabled ? tools.length : 0,
        supportedActions: ['health-check', 'reconnect', 'reload'],
      },
      tools,
    };
  });
}
