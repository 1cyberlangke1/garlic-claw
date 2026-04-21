import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpConfigStoreService } from '../../../src/execution/mcp/mcp-config-store.service';

describe('McpConfigStoreService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  let tempConfigRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    delete process.env[envKey];
    tempConfigRoot = path.join(os.tmpdir(), `mcp-config.service.spec-${Date.now()}-${Math.random()}`, 'servers');
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  it('returns an empty snapshot when the MCP config directory does not exist', async () => {
    process.env[envKey] = tempConfigRoot;
    const service = new McpConfigStoreService();

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigRoot,
      servers: [],
    });
  });

  it('defaults to the repository mcp/servers path when no environment variable is set', () => {
    const workspaceRoot = path.join(os.tmpdir(), `mcp-config.service.workspace-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const defaultConfigRoot = path.join(workspaceRoot, 'mcp', 'servers');
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.mkdirSync(defaultConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'mcp-config-test' }), 'utf-8');
    fs.writeFileSync(path.join(defaultConfigRoot, 'tavily-mcp.json'), JSON.stringify({
      name: 'tavily-mcp',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    }, null, 2));

    process.chdir(nestedServerRoot);

    try {
      const service = new McpConfigStoreService();

      expect(service.getSnapshot()).toEqual({
        configPath: 'mcp/servers',
        servers: [
          {
            name: 'tavily-mcp',
            command: 'npx',
            args: ['-y', 'tavily-mcp@latest'],
            eventLog: {
              maxFileSizeMb: 1,
            },
            env: {
              TAVILY_API_KEY: '${TAVILY_API_KEY}',
            },
          },
        ],
      });
      expect(fs.existsSync(path.join(defaultConfigRoot, 'tavily-mcp.json'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('creates and renames MCP server config files', () => {
    process.env[envKey] = tempConfigRoot;
    fs.mkdirSync(tempConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(tempConfigRoot, 'weather.json'), JSON.stringify({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    }, null, 2));

    const service = new McpConfigStoreService();

    expect(service.saveServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })).toEqual({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
      eventLog: {
        maxFileSizeMb: 1,
      },
    });

    expect(service.saveServer(
      {
        name: 'tavily-search',
        command: 'node',
        args: ['dist/index.js'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
          SEARCH_DEPTH: 'advanced',
        },
        eventLog: {
          maxFileSizeMb: 1,
        },
      },
      'tavily',
    )).toEqual({
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
        SEARCH_DEPTH: 'advanced',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    });

    const weatherPersisted = JSON.parse(fs.readFileSync(path.join(tempConfigRoot, 'weather.json'), 'utf-8'));
    const tavilyPersisted = JSON.parse(fs.readFileSync(path.join(tempConfigRoot, 'tavily-search.json'), 'utf-8'));

    expect(weatherPersisted).toEqual({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    });
    expect(tavilyPersisted).toEqual({
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
        SEARCH_DEPTH: 'advanced',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    });
    expect(fs.existsSync(path.join(tempConfigRoot, 'tavily.json'))).toBe(false);
  });

  it('deletes MCP server files from the config directory', () => {
    process.env[envKey] = tempConfigRoot;
    fs.mkdirSync(tempConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(tempConfigRoot, 'weather.json'), JSON.stringify({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    }, null, 2));
    fs.writeFileSync(path.join(tempConfigRoot, 'tavily.json'), JSON.stringify({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
    }, null, 2));

    const service = new McpConfigStoreService();

    expect(service.deleteServer('weather')).toEqual({
      deleted: true,
      name: 'weather',
    });

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigRoot,
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          eventLog: {
            maxFileSizeMb: 1,
          },
          env: {},
        },
      ],
    });
    expect(fs.existsSync(path.join(tempConfigRoot, 'weather.json'))).toBe(false);
  });
});
