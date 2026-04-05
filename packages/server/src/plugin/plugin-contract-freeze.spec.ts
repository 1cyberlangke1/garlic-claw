import {
  CHAT_MESSAGE_STATUS_VALUES,
  CONNECTION_SCOPED_PLUGIN_HOST_METHODS,
  PLUGIN_HOOK_NAME_VALUES,
  PLUGIN_HOST_METHOD_PERMISSION_MAP,
  PLUGIN_HOST_METHOD_VALUES,
  PLUGIN_INVOCATION_SOURCE_VALUES,
  PLUGIN_MANIFEST_COMMAND_KIND_VALUES,
  PLUGIN_MESSAGE_KIND_VALUES,
  PLUGIN_ROUTE_METHOD_VALUES,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';

describe('plugin contract freeze', () => {
  it('keeps websocket message types stable', () => {
    expect(WS_TYPE).toEqual({
      AUTH: 'auth',
      PLUGIN: 'plugin',
      COMMAND: 'command',
      HEARTBEAT: 'heartbeat',
      ERROR: 'error',
    });
  });

  it('keeps websocket actions stable', () => {
    expect(WS_ACTION).toEqual({
      AUTHENTICATE: 'authenticate',
      AUTH_OK: 'auth_ok',
      AUTH_FAIL: 'auth_fail',
      REGISTER: 'register',
      REGISTER_OK: 'register_ok',
      UNREGISTER: 'unregister',
      STATUS: 'status',
      EXECUTE: 'execute',
      EXECUTE_RESULT: 'execute_result',
      EXECUTE_ERROR: 'execute_error',
      HOOK_INVOKE: 'hook_invoke',
      HOOK_RESULT: 'hook_result',
      HOOK_ERROR: 'hook_error',
      ROUTE_INVOKE: 'route_invoke',
      ROUTE_RESULT: 'route_result',
      ROUTE_ERROR: 'route_error',
      HOST_CALL: 'host_call',
      HOST_RESULT: 'host_result',
      HOST_ERROR: 'host_error',
      PING: 'ping',
      PONG: 'pong',
    });
  });

  it('keeps invocation sources stable', () => {
    expect(PLUGIN_INVOCATION_SOURCE_VALUES).toEqual([
      'chat-tool',
      'chat-hook',
      'cron',
      'automation',
      'http-route',
      'subagent',
      'plugin',
    ]);
  });

  it('keeps plugin route methods stable', () => {
    expect(PLUGIN_ROUTE_METHOD_VALUES).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ]);
  });

  it('keeps plugin message kinds stable', () => {
    expect(PLUGIN_MESSAGE_KIND_VALUES).toEqual([
      'text',
      'image',
      'mixed',
    ]);
  });

  it('keeps manifest command kinds stable', () => {
    expect(PLUGIN_MANIFEST_COMMAND_KIND_VALUES).toEqual([
      'command',
      'group-help',
    ]);
  });

  it('keeps plugin hook names stable', () => {
    expect(PLUGIN_HOOK_NAME_VALUES).toEqual([
      'message:received',
      'chat:before-model',
      'chat:waiting-model',
      'chat:after-model',
      'conversation:created',
      'message:created',
      'message:updated',
      'message:deleted',
      'automation:before-run',
      'automation:after-run',
      'subagent:before-run',
      'subagent:after-run',
      'tool:before-call',
      'tool:after-call',
      'response:before-send',
      'response:after-send',
      'plugin:loaded',
      'plugin:unloaded',
      'plugin:error',
      'cron:tick',
    ]);
  });

  it('keeps chat message statuses stable', () => {
    expect(CHAT_MESSAGE_STATUS_VALUES).toEqual([
      'pending',
      'streaming',
      'completed',
      'stopped',
      'error',
    ]);
  });

  it('keeps plugin host methods stable', () => {
    expect(PLUGIN_HOST_METHOD_VALUES).toEqual([
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
    ]);
  });

  it('keeps connection scoped host methods stable', () => {
    expect(CONNECTION_SCOPED_PLUGIN_HOST_METHODS).toEqual([
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
    ]);
  });

  it('keeps host method permission mapping stable', () => {
    expect(PLUGIN_HOST_METHOD_PERMISSION_MAP).toEqual({
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
    });
  });
});
