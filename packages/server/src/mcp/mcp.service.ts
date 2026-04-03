import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServerConfig } from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { ToolSettingsService } from '../tool/tool-settings.service';
import { McpConfigService } from './mcp-config.service';

interface McpToolListResponse {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
}

interface McpToolCallResponse {
  content?: unknown;
}

interface McpToolingSnapshot {
  statuses: McpServerStatus[];
  tools: McpToolDescriptor[];
}

export type McpServerHealthStatus = 'healthy' | 'error' | 'unknown';

export interface McpServerStatus {
  name: string;
  connected: boolean;
  enabled: boolean;
  health: McpServerHealthStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
}

export interface McpToolDescriptor {
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpServerRuntimeRecord {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpToolDescriptor[];
}

// 超时和重试配置
const MCP_CONNECT_TIMEOUT = 15000; // 连接超时 15 秒
const MCP_TOOL_CALL_TIMEOUT = 10000; // 工具调用超时 10 秒
const MCP_MAX_RETRIES = 2; // 最大重试次数

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private clients = new Map<string, Client>();
  private serverRecords = new Map<string, McpServerRuntimeRecord>();
  private startupWarmupPromise: Promise<void> | null = null;
  private toolSettingsService: ToolSettingsService | null | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpConfig: McpConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async warmupOnStartup(): Promise<void> {
    if (!this.startupWarmupPromise) {
      this.startupWarmupPromise = this.reloadServersFromConfig();
    }

    return this.startupWarmupPromise;
  }

  /**
   * 创建带超时的 Promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`操作超时: ${operation} (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
  }

  async reloadServersFromConfig(): Promise<void> {
    try {
      await this.disconnectAllClients();
      this.serverRecords.clear();

      const snapshot = await this.mcpConfig.getSnapshot();
      for (const server of snapshot.servers) {
        const enabled = this.isServerEnabled(server.name);
        this.setInitialServerRecord(server, enabled);
        if (!enabled) {
          continue;
        }
        await this.connectMcpServer(server.name, server);
      }
    } catch (error) {
      this.logger.warn('加载 MCP 服务器配置失败', error);
    }
  }

  async reloadServer(name: string): Promise<void> {
    const config = await this.mcpConfig.getServer(name);
    if (!config) {
      throw new Error(`MCP server not found: ${name}`);
    }

    await this.disconnectServer(name);
    const enabled = this.isServerEnabled(config.name);
    this.setInitialServerRecord(config, enabled);
    if (!enabled) {
      return;
    }
    await this.connectMcpServer(config.name, config);
  }

  async applyServerConfig(
    config: McpServerConfig,
    previousName?: string,
  ): Promise<void> {
    const normalizedPreviousName = previousName?.trim();
    if (normalizedPreviousName && normalizedPreviousName !== config.name) {
      await this.removeServer(normalizedPreviousName);
    }

    await this.disconnectServer(config.name);
    const enabled = this.isServerEnabled(config.name);
    this.setInitialServerRecord(config, enabled);
    if (!enabled) {
      return;
    }

    await this.connectMcpServer(config.name, config);
  }

  async removeServer(name: string): Promise<void> {
    const normalizedName = name.trim();
    await this.disconnectServer(normalizedName);
    this.serverRecords.delete(normalizedName);
  }

  async reconnectServer(name: string): Promise<void> {
    await this.reloadServer(name);
  }

  async setServerEnabled(name: string, enabled: boolean): Promise<void> {
    const normalizedName = name.trim();
    const config = await this.resolveServerConfig(normalizedName);
    if (!config) {
      throw new Error(`MCP server not found: ${normalizedName}`);
    }

    await this.disconnectServer(normalizedName);
    if (!enabled) {
      this.setDisabledServerRecord(config);
      return;
    }

    this.setInitialServerRecord(config, true);
    await this.connectMcpServer(config.name, config);
  }

  private async connectMcpServer(name: string, config: McpServerConfig) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MCP_MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`尝试连接 MCP 服务器 "${name}" (第 ${attempt}/${MCP_MAX_RETRIES} 次)`);

        // 替换环境变量
        const env: Record<string, string> = config.env ?? {};
        const resolvedEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const envVar = value.slice(2, -1);
            resolvedEnv[key] = this.configService.get<string>(envVar) || '';
          } else {
            resolvedEnv[key] = value;
          }
        }

        // 创建传输层
        const transportEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            transportEnv[key] = value;
          }
        }
        Object.assign(transportEnv, resolvedEnv);

        // 创建传输层
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: transportEnv,
        });

        // 创建客户端
        const client = new Client({
          name: `garlic-claw-${name}`,
          version: '0.1.0',
        }, {
          capabilities: {},
        });

        // 使用带超时的连接
        await this.withTimeout(
          client.connect(transport),
          MCP_CONNECT_TIMEOUT,
          `连接 MCP 服务器 "${name}"`
        );

        const toolsResponse = await this.withTimeout(
          client.listTools(),
          MCP_TOOL_CALL_TIMEOUT,
          `获取 MCP 服务器 "${name}" 工具列表`
        ) as McpToolListResponse;

        this.clients.set(name, client);
        this.serverRecords.set(name, {
          config,
          status: {
            name,
            connected: true,
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: new Date().toISOString(),
          },
          tools: (toolsResponse.tools ?? []).map((tool) => ({
            serverName: name,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
        this.logger.log(`MCP 服务器 "${name}" 连接成功`);
        return; // 成功则退出
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `MCP 服务器 "${name}" 连接失败 (第 ${attempt}/${MCP_MAX_RETRIES} 次): ${lastError.message}`
        );

        if (attempt < MCP_MAX_RETRIES) {
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // 所有重试都失败
    this.logger.error(
      `MCP 服务器 "${name}" 连接失败，已重试 ${MCP_MAX_RETRIES} 次`,
      lastError
    );
    this.serverRecords.set(name, {
      config,
      status: {
        name,
        connected: false,
        enabled: true,
        health: 'error',
        lastError: lastError?.message ?? '连接失败',
        lastCheckedAt: new Date().toISOString(),
      },
      tools: [],
    });
  }

  listServerStatuses(): McpServerStatus[] {
    return this.getToolingSnapshot().statuses;
  }

  async listToolDescriptors(): Promise<McpToolDescriptor[]> {
    return this.getToolingSnapshot().tools;
  }

  getToolingSnapshot(): McpToolingSnapshot {
    const statuses: McpServerStatus[] = [];
    const tools: McpToolDescriptor[] = [];

    for (const record of this.serverRecords.values()) {
      statuses.push({
        ...record.status,
      });

      if (!record.status.connected || !record.status.enabled) {
        continue;
      }

      for (const tool of record.tools) {
        tools.push({
          ...tool,
        });
      }
    }

    return {
      statuses,
      tools,
    };
  }

  async callTool(input: {
    serverName: string;
    toolName: string;
    arguments: JsonObject;
  }): Promise<JsonValue> {
    const record = this.serverRecords.get(input.serverName);
    if (record && !record.status.enabled) {
      throw new Error(`MCP 服务器 "${input.serverName}" 已禁用`);
    }

    const client = this.clients.get(input.serverName);
    if (!client) {
      this.updateServerStatus(input.serverName, {
        connected: false,
        health: 'error',
        lastError: `MCP 服务器 "${input.serverName}" 未连接`,
      });
      throw new Error(`MCP 服务器 "${input.serverName}" 未连接`);
    }

    try {
      const result = await this.withTimeout(
        client.callTool({
          name: input.toolName,
          arguments: input.arguments,
        }),
        MCP_TOOL_CALL_TIMEOUT,
        `调用 MCP 工具 "${input.serverName}__${input.toolName}"`
      ) as McpToolCallResponse;
      this.updateServerStatus(input.serverName, {
        connected: true,
        health: 'healthy',
        lastError: null,
      });
      return (result.content ?? null) as JsonValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`调用 MCP 工具 "${input.serverName}__${input.toolName}" 失败: ${errorMessage}`);
      this.updateServerStatus(input.serverName, {
        connected: true,
        health: 'error',
        lastError: errorMessage,
      });
      throw error;
    }
  }

  private updateServerStatus(
    name: string,
    patch: Partial<Pick<McpServerStatus, 'connected' | 'health' | 'lastError'>>,
  ) {
    const existing = this.serverRecords.get(name);
    if (!existing) {
      return;
    }

    existing.status = {
      ...existing.status,
      ...patch,
      lastCheckedAt: new Date().toISOString(),
    };
    this.serverRecords.set(name, existing);
  }

  private setInitialServerRecord(
    config: McpServerConfig,
    enabled = this.isServerEnabled(config.name),
  ): void {
    this.serverRecords.set(config.name, {
      config,
      status: {
        name: config.name,
        connected: false,
        enabled,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
      },
      tools: [],
    });
  }

  private setDisabledServerRecord(config: McpServerConfig): void {
    this.serverRecords.set(config.name, {
      config,
      status: {
        name: config.name,
        connected: false,
        enabled: false,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: new Date().toISOString(),
      },
      tools: [],
    });
  }

  private async resolveServerConfig(name: string): Promise<McpServerConfig | null> {
    return (await this.mcpConfig.getServer(name))
      ?? this.serverRecords.get(name)?.config
      ?? null;
  }

  private async disconnectAllClients(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        try {
          await client.close();
        } catch {
          // 忽略关闭阶段的清理错误，避免阻塞整体重载。
        }
      }),
    );
    this.clients.clear();
  }

  private async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch {
        // 忽略关闭阶段的清理错误，避免阻塞单个 server 重连。
      }
      this.clients.delete(name);
    }
  }

  private getToolSettingsService(): ToolSettingsService | null {
    if (this.toolSettingsService === undefined) {
      try {
        this.toolSettingsService = this.moduleRef.get(ToolSettingsService, {
          strict: false,
        });
      } catch {
        this.toolSettingsService = null;
      }
    }

    return this.toolSettingsService ?? null;
  }

  private isServerEnabled(name: string): boolean {
    return this.getToolSettingsService()?.getSourceEnabled('mcp', name) ?? true;
  }
}
