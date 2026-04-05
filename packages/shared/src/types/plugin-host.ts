import type { JsonObject, JsonValue } from './json';
import type { PluginCallContext, PluginPermission } from './plugin';

/** Host API 方法名。 */
export type PluginHostMethod =
  | 'automation.create'
  | 'automation.event.emit'
  | 'automation.list'
  | 'automation.run'
  | 'automation.toggle'
  | 'config.get'
  | 'cron.delete'
  | 'cron.list'
  | 'cron.register'
  | 'conversation.get'
  | 'conversation.session.finish'
  | 'conversation.session.get'
  | 'conversation.session.keep'
  | 'conversation.session.start'
  | 'conversation.messages.list'
  | 'conversation.title.set'
  | 'kb.get'
  | 'kb.list'
  | 'kb.search'
  | 'llm.generate'
  | 'llm.generate-text'
  | 'log.list'
  | 'log.write'
  | 'message.send'
  | 'message.target.current.get'
  | 'memory.search'
  | 'memory.save'
  | 'persona.activate'
  | 'persona.current.get'
  | 'persona.get'
  | 'persona.list'
  | 'plugin.self.get'
  | 'provider.current.get'
  | 'provider.get'
  | 'provider.list'
  | 'provider.model.get'
  | 'storage.delete'
  | 'storage.get'
  | 'storage.list'
  | 'storage.set'
  | 'subagent.run'
  | 'subagent.task.get'
  | 'subagent.task.list'
  | 'subagent.task.start'
  | 'state.delete'
  | 'state.get'
  | 'state.list'
  | 'state.set'
  | 'user.get';

export const PLUGIN_HOST_METHOD_VALUES = [
  'automation.create',
  'automation.event.emit',
  'automation.list',
  'automation.run',
  'automation.toggle',
  'config.get',
  'cron.delete',
  'cron.list',
  'cron.register',
  'conversation.get',
  'conversation.session.finish',
  'conversation.session.get',
  'conversation.session.keep',
  'conversation.session.start',
  'conversation.messages.list',
  'conversation.title.set',
  'kb.get',
  'kb.list',
  'kb.search',
  'llm.generate',
  'llm.generate-text',
  'log.list',
  'log.write',
  'message.send',
  'message.target.current.get',
  'memory.search',
  'memory.save',
  'persona.activate',
  'persona.current.get',
  'persona.get',
  'persona.list',
  'plugin.self.get',
  'provider.current.get',
  'provider.get',
  'provider.list',
  'provider.model.get',
  'storage.delete',
  'storage.get',
  'storage.list',
  'storage.set',
  'subagent.run',
  'subagent.task.get',
  'subagent.task.list',
  'subagent.task.start',
  'state.delete',
  'state.get',
  'state.list',
  'state.set',
  'user.get',
] as const satisfies PluginHostMethod[];

export const CONNECTION_SCOPED_PLUGIN_HOST_METHODS = [
  'config.get',
  'cron.delete',
  'cron.list',
  'cron.register',
  'kb.get',
  'kb.list',
  'kb.search',
  'log.list',
  'log.write',
  'persona.current.get',
  'persona.get',
  'persona.list',
  'plugin.self.get',
  'provider.current.get',
  'provider.get',
  'provider.list',
  'provider.model.get',
  'state.delete',
  'state.get',
  'state.list',
  'state.set',
  'storage.delete',
  'storage.get',
  'storage.list',
  'storage.set',
] as const satisfies PluginHostMethod[];

export const PLUGIN_HOST_METHOD_PERMISSION_MAP = {
  'automation.create': 'automation:write',
  'automation.event.emit': 'automation:write',
  'automation.list': 'automation:read',
  'automation.run': 'automation:write',
  'automation.toggle': 'automation:write',
  'config.get': 'config:read',
  'cron.delete': 'cron:write',
  'cron.list': 'cron:read',
  'cron.register': 'cron:write',
  'conversation.get': 'conversation:read',
  'conversation.session.finish': 'conversation:write',
  'conversation.session.get': 'conversation:write',
  'conversation.session.keep': 'conversation:write',
  'conversation.session.start': 'conversation:write',
  'conversation.messages.list': 'conversation:read',
  'conversation.title.set': 'conversation:write',
  'kb.get': 'kb:read',
  'kb.list': 'kb:read',
  'kb.search': 'kb:read',
  'llm.generate': 'llm:generate',
  'llm.generate-text': 'llm:generate',
  'log.list': 'log:read',
  'log.write': 'log:write',
  'message.send': 'conversation:write',
  'message.target.current.get': 'conversation:read',
  'memory.search': 'memory:read',
  'memory.save': 'memory:write',
  'persona.activate': 'persona:write',
  'persona.current.get': 'persona:read',
  'persona.get': 'persona:read',
  'persona.list': 'persona:read',
  'plugin.self.get': null,
  'provider.current.get': 'provider:read',
  'provider.get': 'provider:read',
  'provider.list': 'provider:read',
  'provider.model.get': 'provider:read',
  'storage.delete': 'storage:write',
  'storage.get': 'storage:read',
  'storage.list': 'storage:read',
  'storage.set': 'storage:write',
  'subagent.run': 'subagent:run',
  'subagent.task.get': 'subagent:run',
  'subagent.task.list': 'subagent:run',
  'subagent.task.start': 'subagent:run',
  'state.delete': 'state:write',
  'state.get': 'state:read',
  'state.list': 'state:read',
  'state.set': 'state:write',
  'user.get': 'user:read',
} as const satisfies Record<PluginHostMethod, PluginPermission | null>;

/** Host API 调用负载。 */
export interface HostCallPayload {
  method: PluginHostMethod;
  params: JsonObject;
  context?: PluginCallContext;
}

/** Host API 返回负载。 */
export interface HostResultPayload {
  data: JsonValue;
}
