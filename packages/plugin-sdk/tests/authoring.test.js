const test = require('node:test');
const assert = require('node:assert/strict');

const authoringModule = require('../dist/authoring/index.js');
const {
  buildConversationTitlePrompt,
  createPluginAuthorTransportExecutor,
  readConversationSummary,
} = authoringModule;

test('authoring subpath exposes supported helper exports', () => {
  assert.equal(typeof createPluginAuthorTransportExecutor, 'function');
  assert.equal(typeof buildConversationTitlePrompt, 'function');
  assert.deepEqual(readConversationSummary({
    id: 'conv-1',
    title: '标题',
  }), {
    id: 'conv-1',
    title: '标题',
  });
  assert.equal(Object.hasOwn(authoringModule, 'AUTOMATION_RECORDER_MANIFEST'), false);
  assert.equal(Object.hasOwn(authoringModule, 'MESSAGE_ENTRY_RECORDER_MANIFEST'), false);
  assert.equal(Object.hasOwn(authoringModule, 'TOOL_AUDIT_MANIFEST'), false);
});
