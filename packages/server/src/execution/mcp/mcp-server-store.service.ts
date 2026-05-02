import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';
import { normalizeEventLogSettings } from '../../core/logging/runtime-event-log.service';

type StoredMcpServerFile = Partial<McpServerConfig> & {
  name?: string;
};

@Injectable()
export class McpServerStoreService {
  private readonly configRootPath: string;
  private readonly reportedConfigPath: string;
  private servers: McpServerConfig[];

  constructor(private readonly projectWorktreeRootService: ProjectWorktreeRootService) {
    this.configRootPath = this.resolveMcpConfigRootPath();
    this.reportedConfigPath = readReportedMcpConfigPath(this.configRootPath);
    this.servers = this.loadServers();
  }

  getSnapshot(): McpConfigSnapshot {
    return {
      configPath: this.reportedConfigPath,
      servers: this.servers.map(cloneServerConfig),
    };
  }

  getServer(name: string): McpServerConfig | null {
    return this.servers.find((entry) => entry.name === name) ?? null;
  }

  saveServer(server: McpServerConfig, previousName?: string): McpServerConfig {
    fs.mkdirSync(this.configRootPath, { recursive: true });
    fs.writeFileSync(
      resolveServerFilePath(this.configRootPath, server.name),
      JSON.stringify(serializeServer(server), null, 2),
      'utf-8',
    );

    if (previousName && previousName !== server.name) {
      fs.rmSync(resolveServerFilePath(this.configRootPath, previousName), { force: true });
    }

    this.servers = this.upsertServer(server, previousName);
    return cloneServerConfig(server);
  }

  deleteServer(name: string): McpServerDeleteResult {
    const current = this.getServer(name);
    if (!current) {
      throw new NotFoundException(`MCP server not found: ${name}`);
    }

    fs.rmSync(resolveServerFilePath(this.configRootPath, name), { force: true });
    this.servers = this.servers.filter((entry) => entry.name !== name);
    return { deleted: true, name };
  }

  private loadServers(): McpServerConfig[] {
    try {
      fs.mkdirSync(this.configRootPath, { recursive: true });
      return fs.readdirSync(this.configRootPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => readServerFile(path.join(this.configRootPath, entry.name)))
        .filter((server): server is McpServerConfig => server !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }

  private upsertServer(server: McpServerConfig, previousName?: string): McpServerConfig[] {
    const nextServers = this.servers.filter((entry) => entry.name !== (previousName ?? server.name));
    nextServers.push(cloneServerConfig(server));
    return nextServers.sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveMcpConfigRootPath(): string {
    if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
      return path.resolve(process.env.GARLIC_CLAW_MCP_CONFIG_PATH);
    }

    return path.join(this.projectWorktreeRootService.resolveRoot(process.cwd()), 'config', 'mcp', 'servers');
  }
}

function readServerFile(filePath: string): McpServerConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredMcpServerFile;
    const fallbackName = decodeURIComponent(path.basename(filePath, path.extname(filePath)));
    return toServerConfig(raw, fallbackName);
  } catch {
    return null;
  }
}

function toServerConfig(raw: StoredMcpServerFile, fallbackName: string): McpServerConfig | null {
  const name = typeof raw.name === 'string' && raw.name.trim().length > 0
    ? raw.name.trim()
    : fallbackName;
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  if (!name || !command || !Array.isArray(raw.args)) {
    return null;
  }

  const env = typeof raw.env === 'object' && raw.env !== null ? raw.env : {};
  return {
    name,
    command,
    args: raw.args.filter((value): value is string => typeof value === 'string'),
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    eventLog: normalizeEventLogSettings(raw.eventLog),
  };
}

function serializeServer(server: McpServerConfig): McpServerConfig {
  return {
    name: server.name,
    command: server.command,
    args: [...server.args],
    env: { ...server.env },
    eventLog: normalizeEventLogSettings(server.eventLog),
  };
}

function cloneServerConfig(server: McpServerConfig): McpServerConfig {
  return serializeServer(server);
}

function readReportedMcpConfigPath(configRootPath: string): string {
  if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
    return configRootPath;
  }

  return 'config/mcp/servers';
}

function resolveServerFilePath(configRootPath: string, serverName: string): string {
  return path.join(configRootPath, `${encodeURIComponent(serverName)}.json`);
}
