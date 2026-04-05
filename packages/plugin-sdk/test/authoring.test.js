const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTOMATION_TOOLS_MANIFEST,
  AUTOMATION_RECORDER_MANIFEST,
  CRON_HEARTBEAT_MANIFEST,
  CONVERSATION_TITLE_MANIFEST,
  CORE_TOOLS_MANIFEST,
  MEMORY_CONTEXT_MANIFEST,
  ROUTE_INSPECTOR_MANIFEST,
  RESPONSE_RECORDER_MANIFEST,
  buildConversationTitlePrompt,
  createAutomationCreatedResult,
  buildToolAuditStorageKey,
  createPluginAuthorTransportExecutor,
  createRouteInspectorContextResponse,
  createSubagentRunSummary,
  persistPluginObservation,
  readMemorySaveResultId,
  readConversationSummary,
} = require('../dist/authoring/index.js');

test('authoring subpath exposes builtin observer exports', () => {
  assert.equal(AUTOMATION_RECORDER_MANIFEST.id, 'builtin.automation-recorder');
  assert.equal(AUTOMATION_TOOLS_MANIFEST.id, 'builtin.automation-tools');
  assert.equal(CORE_TOOLS_MANIFEST.id, 'builtin.core-tools');
  assert.equal(CONVERSATION_TITLE_MANIFEST.id, 'builtin.conversation-title');
  assert.equal(MEMORY_CONTEXT_MANIFEST.id, 'builtin.memory-context');
  assert.equal(CRON_HEARTBEAT_MANIFEST.id, 'builtin.cron-heartbeat');
  assert.equal(ROUTE_INSPECTOR_MANIFEST.id, 'builtin.route-inspector');
  assert.equal(RESPONSE_RECORDER_MANIFEST.id, 'builtin.response-recorder');
  assert.equal(typeof persistPluginObservation, 'function');
  assert.equal(typeof createPluginAuthorTransportExecutor, 'function');
  assert.equal(typeof createAutomationCreatedResult, 'function');
  assert.equal(typeof createSubagentRunSummary, 'function');
  assert.equal(readMemorySaveResultId({ id: 'memory-1' }), 'memory-1');
  assert.equal(typeof buildConversationTitlePrompt, 'function');
  assert.deepEqual(readConversationSummary({
    id: 'conv-1',
    title: '标题',
  }), {
    id: 'conv-1',
    title: '标题',
  });
  assert.equal(
    buildToolAuditStorageKey({
      source: {
        kind: 'plugin',
        id: 'builtin.tool-audit',
      },
      pluginId: 'builtin.tool-audit',
      tool: {
        name: 'current_time',
      },
    }),
    'tool.builtin.tool-audit.current_time.last-call',
  );
  assert.deepEqual(
    createRouteInspectorContextResponse({
      plugin: { id: 'builtin.route-inspector' },
      user: { id: 'user-1' },
      conversation: { id: 'conv-1', title: '标题' },
      messageCount: 2,
    }),
    {
      status: 200,
      body: {
        plugin: { id: 'builtin.route-inspector' },
        user: { id: 'user-1' },
        conversation: { id: 'conv-1', title: '标题' },
        messageCount: 2,
      },
    },
  );
});
