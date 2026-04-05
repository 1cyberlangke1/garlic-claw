const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPluginMessageSendParams,
  buildPluginRegisterCronParams,
  createPluginHostFacade,
  toHostJsonValue,
  toScopedStateParams,
} = require('../dist/host/index.js');

test('host subpath exposes host facade builders and helpers', async () => {
  const calls = [];
  const host = createPluginHostFacade({
    call(method, params) {
      calls.push({ kind: 'call', method, params });
      return Promise.resolve({ ok: true });
    },
    callHost(method, params = {}) {
      calls.push({ kind: 'callHost', method, params });
      return Promise.resolve({ ok: true });
    },
  });

  await host.sendMessage({
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  });

  assert.deepEqual(buildPluginMessageSendParams({
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  }), {
    content: 'hello',
    target: {
      type: 'conversation',
      id: 'conv-1',
    },
  });
  assert.deepEqual(buildPluginRegisterCronParams({
    name: 'heartbeat',
    cron: '10s',
  }), {
    name: 'heartbeat',
    cron: '10s',
  });
  assert.deepEqual(toScopedStateParams({ scope: 'conversation' }), {
    scope: 'conversation',
  });
  assert.deepEqual(toHostJsonValue({
    foo: undefined,
    bar: ['x', undefined, 1],
  }), {
    bar: ['x', 1],
  });
  assert.deepEqual(calls[0], {
    kind: 'callHost',
    method: 'message.send',
    params: {
      content: 'hello',
      target: {
        type: 'conversation',
        id: 'conv-1',
      },
    },
  });
});
