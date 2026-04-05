import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiController } from './ai/ai.controller';
import { AutomationController } from './automation/automation.controller';
import { ApiKeyController } from './auth/api-key.controller';
import { AuthController } from './auth/auth.controller';
import { ChatController } from './chat/chat.controller';
import { OpenApiMessageController } from './chat/open-api-message.controller';
import { McpController } from './mcp/mcp.controller';
import { MemoryController } from './memory/memory.controller';
import { PersonaController } from './persona/persona.controller';
import { PluginCommandController } from './plugin/plugin-command.controller';
import { PluginRouteController } from './plugin/plugin-route.controller';
import { PluginSubagentTaskController } from './plugin/plugin-subagent-task.controller';
import { PluginController } from './plugin/plugin.controller';
import { SkillController } from './skill/skill.controller';
import { ToolController } from './tool/tool.controller';
import { UserController } from './user/user.controller';

const API_CONTROLLERS = [
  AiController,
  ApiKeyController,
  AuthController,
  AutomationController,
  ChatController,
  McpController,
  MemoryController,
  OpenApiMessageController,
  PersonaController,
  PluginCommandController,
  PluginController,
  PluginRouteController,
  PluginSubagentTaskController,
  SkillController,
  ToolController,
  UserController,
] as const;

const WEB_API_UTILITY_FILES = [
  'base.ts',
  'shared-contract.typecheck.ts',
] as const;

const SERVER_CONTROLLER_WEB_API_COVERAGE: Record<string, string[]> = {
  'ai': ['ai-settings'],
  'auth': ['auth'],
  'auth/api-keys': ['api-keys'],
  'automations': ['automations'],
  'chat': ['chat', 'skills'],
  'mcp': ['tools'],
  'personas': ['personas'],
  'plugin-commands': ['commands'],
  'plugin-routes': ['plugins'],
  'plugin-subagent-tasks': ['subagents'],
  'plugins': ['plugins'],
  'skills': ['skills'],
  'tools': ['tools'],
  'users': ['auth'],
};

const SERVER_ONLY_CONTROLLER_GROUPS = [
  'memories',
  'open-api/conversations',
] as const;

describe('api contract freeze', () => {
  it('keeps auth routes stable', () => {
    expect(listControllerRoutes(AuthController)).toEqual([
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/register',
    ]);
  });

  it('keeps api key routes stable', () => {
    expect(listControllerRoutes(ApiKeyController)).toEqual([
      'GET /api/auth/api-keys',
      'POST /api/auth/api-keys',
      'POST /api/auth/api-keys/:id/revoke',
    ]);
  });

  it('keeps user and memory routes stable', () => {
    expect(listControllerRoutes(UserController)).toEqual([
      'DELETE /api/users/:id',
      'GET /api/users',
      'GET /api/users/:id',
      'GET /api/users/me',
      'PATCH /api/users/:id',
      'PATCH /api/users/:id/role',
    ]);
    expect(listControllerRoutes(MemoryController)).toEqual([
      'DELETE /api/memories/:id',
      'GET /api/memories',
    ]);
  });

  it('keeps ai routes stable', () => {
    expect(listControllerRoutes(AiController)).toEqual([
      'DELETE /api/ai/providers/:providerId',
      'DELETE /api/ai/providers/:providerId/models/:modelId',
      'GET /api/ai/host-model-routing',
      'GET /api/ai/provider-catalog',
      'GET /api/ai/providers',
      'GET /api/ai/providers/:providerId',
      'GET /api/ai/providers/:providerId/models',
      'GET /api/ai/vision-fallback',
      'POST /api/ai/providers/:providerId/discover-models',
      'POST /api/ai/providers/:providerId/models/:modelId',
      'POST /api/ai/providers/:providerId/test-connection',
      'PUT /api/ai/host-model-routing',
      'PUT /api/ai/providers/:providerId',
      'PUT /api/ai/providers/:providerId/default-model',
      'PUT /api/ai/providers/:providerId/models/:modelId/capabilities',
      'PUT /api/ai/vision-fallback',
    ]);
  });

  it('keeps mcp, tool, skill, persona and automation routes stable', () => {
    expect(listControllerRoutes(McpController)).toEqual([
      'DELETE /api/mcp/servers/:name',
      'GET /api/mcp/servers',
      'POST /api/mcp/servers',
      'PUT /api/mcp/servers/:name',
    ]);
    expect(listControllerRoutes(ToolController)).toEqual([
      'GET /api/tools/overview',
      'POST /api/tools/sources/:kind/:sourceId/actions/:action',
      'PUT /api/tools/:toolId/enabled',
      'PUT /api/tools/sources/:kind/:sourceId/enabled',
    ]);
    expect(listControllerRoutes(SkillController)).toEqual([
      'GET /api/skills',
      'POST /api/skills/refresh',
      'PUT /api/skills/:skillId/governance',
    ]);
    expect(listControllerRoutes(PersonaController)).toEqual([
      'GET /api/personas',
      'GET /api/personas/current',
      'PUT /api/personas/current',
    ]);
    expect(listControllerRoutes(AutomationController)).toEqual([
      'DELETE /api/automations/:id',
      'GET /api/automations',
      'GET /api/automations/:id',
      'GET /api/automations/:id/logs',
      'PATCH /api/automations/:id/toggle',
      'POST /api/automations',
      'POST /api/automations/:id/run',
    ]);
  });

  it('keeps chat routes stable', () => {
    expect(listControllerRoutes(ChatController)).toEqual([
      'DELETE /api/chat/conversations/:id',
      'DELETE /api/chat/conversations/:id/messages/:messageId',
      'GET /api/chat/conversations',
      'GET /api/chat/conversations/:id',
      'GET /api/chat/conversations/:id/services',
      'GET /api/chat/conversations/:id/skills',
      'PATCH /api/chat/conversations/:id/messages/:messageId',
      'POST /api/chat/conversations',
      'POST /api/chat/conversations/:id/messages',
      'POST /api/chat/conversations/:id/messages/:messageId/retry',
      'POST /api/chat/conversations/:id/messages/:messageId/stop',
      'PUT /api/chat/conversations/:id/services',
      'PUT /api/chat/conversations/:id/skills',
    ]);
    expect(listControllerRoutes(OpenApiMessageController)).toEqual([
      'POST /api/open-api/conversations/:conversationId/messages/assistant',
    ]);
  });

  it('keeps plugin http routes stable', () => {
    expect(listControllerRoutes(PluginCommandController)).toEqual([
      'GET /api/plugin-commands/overview',
    ]);
    expect(listControllerRoutes(PluginSubagentTaskController)).toEqual([
      'GET /api/plugin-subagent-tasks/:taskId',
      'GET /api/plugin-subagent-tasks/overview',
    ]);
    expect(listControllerRoutes(PluginController)).toEqual([
      'DELETE /api/plugins/:name',
      'DELETE /api/plugins/:name/crons/:jobId',
      'DELETE /api/plugins/:name/sessions/:conversationId',
      'DELETE /api/plugins/:name/storage',
      'GET /api/plugins',
      'GET /api/plugins/:name/config',
      'GET /api/plugins/:name/crons',
      'GET /api/plugins/:name/events',
      'GET /api/plugins/:name/health',
      'GET /api/plugins/:name/scopes',
      'GET /api/plugins/:name/sessions',
      'GET /api/plugins/:name/storage',
      'GET /api/plugins/connected',
      'POST /api/plugins/:name/actions/:action',
      'POST /api/plugins/remote/bootstrap',
      'PUT /api/plugins/:name/config',
      'PUT /api/plugins/:name/scopes',
      'PUT /api/plugins/:name/storage',
    ]);
    expect(listControllerRoutes(PluginRouteController)).toEqual([
      'ALL /api/plugin-routes/:pluginId/*path',
    ]);
  });

  it('keeps web feature api files aligned with controller resource groups', () => {
    expect(listWebApiUtilityFiles()).toEqual([
      'base.ts',
      'shared-contract.typecheck.ts',
    ]);

    expect(listWebFeatureApiRoots()).toEqual([
      'ai-settings',
      'api-keys',
      'auth',
      'automations',
      'chat',
      'commands',
      'personas',
      'plugins',
      'skills',
      'subagents',
      'tools',
    ]);

    expect(listWebFeatureApiFiles()).toEqual([
      'ai-settings/ai.ts',
      'api-keys/api-keys.ts',
      'auth/auth.ts',
      'automations/automations.ts',
      'chat/chat.ts',
      'commands/plugin-commands.ts',
      'personas/personas.ts',
      'plugins/plugins.ts',
      'skills/skills.ts',
      'subagents/plugin-subagent-tasks.ts',
      'tools/mcp.ts',
      'tools/tools.ts',
    ]);

    expect(listServerControllerPaths()).toEqual([
      ...Object.keys(SERVER_CONTROLLER_WEB_API_COVERAGE),
      ...SERVER_ONLY_CONTROLLER_GROUPS,
    ].sort());

    const claimedModules = [
      ...new Set(
        Object.values(SERVER_CONTROLLER_WEB_API_COVERAGE).flat(),
      ),
    ].sort();

    expect(claimedModules).toEqual(listWebFeatureApiRoots());
  });
});

type ControllerClass = abstract new (...args: never[]) => object;

function listControllerRoutes(
  controller: ControllerClass,
): string[] {
  const controllerPaths = readPathMetadata(controller);
  const prototype = controller.prototype as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype)
    .filter((propertyName) => propertyName !== 'constructor')
    .flatMap((propertyName) => {
      const handler = prototype[propertyName];
      if (typeof handler !== 'function') {
        return [];
      }

      const requestMethod = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod | undefined;
      if (typeof requestMethod === 'undefined') {
        return [];
      }

      return controllerPaths.flatMap((controllerPath) =>
        readPathMetadata(handler).map((handlerPath) => (
          `${toHttpMethodLabel(requestMethod)} /api${joinRoutePath(controllerPath, handlerPath)}`
        )));
    })
    .sort();
}

function listServerControllerPaths(): string[] {
  return API_CONTROLLERS
    .flatMap((controller) => readPathMetadata(controller))
    .sort();
}

function listWebFeatureApiRoots(): string[] {
  const featuresDirectory = resolve(process.cwd(), '../web/src/features');
  return readdirSync(featuresDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((featureName) => {
      const apiDirectory = resolve(featuresDirectory, featureName, 'api');
      try {
        return readdirSync(apiDirectory).some((fileName) => fileName.endsWith('.ts'));
      } catch {
        return false;
      }
    })
    .sort();
}

function listWebApiUtilityFiles(): string[] {
  const apiDirectory = resolve(process.cwd(), '../web/src/api');
  return readdirSync(apiDirectory)
    .filter((fileName) => fileName.endsWith('.ts'))
    .filter((fileName) => WEB_API_UTILITY_FILES.includes(fileName as typeof WEB_API_UTILITY_FILES[number]))
    .sort();
}

function listWebFeatureApiFiles(): string[] {
  const featuresDirectory = resolve(process.cwd(), '../web/src/features');
  return listWebFeatureApiRoots()
    .flatMap((featureName) => {
      const apiDirectory = resolve(featuresDirectory, featureName, 'api');
      return readdirSync(apiDirectory)
        .filter((fileName) => fileName.endsWith('.ts'))
        .map((fileName) => `${featureName}/${fileName}`);
    })
    .sort();
}

function readPathMetadata(target: object): string[] {
  const metadata = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
  if (Array.isArray(metadata)) {
    return metadata.map((value) => normalizePathSegment(value));
  }

  return [normalizePathSegment(metadata ?? '')];
}

function normalizePathSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^\/+|\/+$/g, '');
}

function joinRoutePath(controllerPath: string, handlerPath: string): string {
  const parts = [controllerPath, handlerPath].filter((part) => part.length > 0);
  return parts.length > 0 ? `/${parts.join('/')}` : '';
}

function toHttpMethodLabel(method: RequestMethod): string {
  switch (method) {
    case RequestMethod.GET:
      return 'GET';
    case RequestMethod.POST:
      return 'POST';
    case RequestMethod.PUT:
      return 'PUT';
    case RequestMethod.DELETE:
      return 'DELETE';
    case RequestMethod.PATCH:
      return 'PATCH';
    case RequestMethod.ALL:
      return 'ALL';
    default:
      return `UNKNOWN(${method})`;
  }
}
