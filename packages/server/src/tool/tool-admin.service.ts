import type {
  PluginActionName,
  ToolSourceActionResult,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { McpService } from '../mcp/mcp.service';
import type { PluginAdminService } from '../plugin/plugin-admin.service';
import type { ToolSourceKind } from './tool.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolAdminService {
  private pluginAdminPromise?: Promise<PluginAdminService>;
  private mcpServicePromise?: Promise<McpService>;

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async runSourceAction(
    kind: ToolSourceKind,
    sourceId: string,
    action: PluginActionName,
  ): Promise<ToolSourceActionResult> {
    const source = await this.findSource(kind, sourceId);
    const supportedActions = source.supportedActions ?? [];
    if (!supportedActions.includes(action)) {
      throw new BadRequestException(
        `工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`,
      );
    }

    if (kind === 'plugin') {
      const pluginAdmin = await this.getPluginAdmin();
      const result = await pluginAdmin.runAction(sourceId, action);
      return {
        accepted: result.accepted,
        action: result.action,
        sourceKind: 'plugin',
        sourceId,
        message: result.message,
      };
    }

    return this.runMcpSourceAction(sourceId, action);
  }

  private async findSource(
    kind: ToolSourceKind,
    sourceId: string,
  ): Promise<ToolSourceInfo> {
    const source = (await this.toolRegistry.listSources()).find((entry) =>
      entry.kind === kind && entry.id === sourceId);
    if (!source) {
      throw new NotFoundException(`Tool source not found: ${kind}:${sourceId}`);
    }

    return source;
  }

  private async runMcpSourceAction(
    sourceId: string,
    action: PluginActionName,
  ): Promise<ToolSourceActionResult> {
    const mcpService = await this.getMcpService();
    if (action === 'reload') {
      await mcpService.reloadServer(sourceId);
      return {
        accepted: true,
        action,
        sourceKind: 'mcp',
        sourceId,
        message: 'MCP source reloaded',
      };
    }

    if (action === 'reconnect') {
      await mcpService.reconnectServer(sourceId);
      return {
        accepted: true,
        action,
        sourceKind: 'mcp',
        sourceId,
        message: 'MCP source reconnected',
      };
    }

    if (action !== 'health-check') {
      throw new BadRequestException(`MCP source does not support action: ${action}`);
    }

    const status = mcpService.listServerStatuses().find((entry) => entry.name === sourceId);
    if (!status) {
      throw new NotFoundException(`MCP source not found: ${sourceId}`);
    }

    const message = status.connected && status.health === 'healthy'
      ? 'MCP source health check passed'
      : status.lastError
        ? `MCP source health check failed: ${status.lastError}`
        : 'MCP source health check failed';

    return {
      accepted: true,
      action,
      sourceKind: 'mcp',
      sourceId,
      message,
    };
  }

  private async getPluginAdmin(): Promise<PluginAdminService> {
    if (this.pluginAdminPromise) {
      return this.pluginAdminPromise;
    }

    this.pluginAdminPromise = (async () => {
      const { PluginAdminService } = await import('../plugin/plugin-admin.service');
      const resolved = this.moduleRef.get<PluginAdminService>(PluginAdminService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('PluginAdminService is not available');
      }

      return resolved;
    })();

    return this.pluginAdminPromise;
  }

  private async getMcpService(): Promise<McpService> {
    if (this.mcpServicePromise) {
      return this.mcpServicePromise;
    }

    this.mcpServicePromise = (async () => {
      const { McpService } = await import('../mcp/mcp.service');
      const resolved = this.moduleRef.get<McpService>(McpService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('McpService is not available');
      }

      return resolved;
    })();

    return this.mcpServicePromise;
  }
}
