import type { EventLogListResult, McpConfigSnapshot, McpServerConfig, McpServerDeleteResult } from '@garlic-claw/shared';
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { McpService } from './mcp.service';
import { normalizeEventLogSettings } from '../../../core/logging/runtime-event-log.service';
import { readPluginEventQuery } from '../../../shared/http/http-request.codec';

interface McpEventQueryInput {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  async listServers(): Promise<McpConfigSnapshot> {
    return this.mcpService.getSnapshot();
  }

  @Get('servers/:name/events')
  async listServerEvents(
    @Param('name') name: string,
    @Query() query?: McpEventQueryInput,
  ): Promise<EventLogListResult> {
    return this.mcpService.listServerEvents(name, readPluginEventQuery(query ?? {}));
  }

  @Post('servers')
  async createServer(@Body() dto: {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    envEntries?: Array<{ key: string; value: string }>;
  }): Promise<McpServerConfig> {
    const server = await this.mcpService.saveServer({
      ...dto,
      env: {
        ...(dto.env ?? {}),
        ...Object.fromEntries((dto.envEntries ?? []).map((entry) => [entry.key, entry.value])),
      },
      eventLog: normalizeEventLogSettings((dto as { eventLog?: McpServerConfig['eventLog'] }).eventLog),
    });
    await this.mcpService.applyServerConfig(server);
    return server;
  }

  @Put('servers/:name')
  async updateServer(
    @Param('name') name: string,
    @Body() dto: {
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
      envEntries?: Array<{ key: string; value: string }>;
    },
  ): Promise<McpServerConfig> {
    const server = await this.mcpService.saveServer({
      ...dto,
      env: {
        ...(dto.env ?? {}),
        ...Object.fromEntries((dto.envEntries ?? []).map((entry) => [entry.key, entry.value])),
      },
      eventLog: normalizeEventLogSettings((dto as { eventLog?: McpServerConfig['eventLog'] }).eventLog),
    }, name);
    await this.mcpService.applyServerConfig(server, name);
    return server;
  }

  @Delete('servers/:name')
  async deleteServer(@Param('name') name: string): Promise<McpServerDeleteResult> {
    const deleted = await this.mcpService.deleteServer(name);
    await this.mcpService.removeServer(name);
    return deleted;
  }
}
