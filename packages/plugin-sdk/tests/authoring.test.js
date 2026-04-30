const test = require('node:test');
const assert = require('node:assert/strict');

const authoringModule = require('../dist/authoring/index.js');
const {
  buildConversationTitlePrompt,
  buildSubagentSendInputParams,
  buildSubagentSpawnParams,
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

test('subagent authoring helpers allow explicit provider/model overrides', () => {
  const config = {
    allowedToolNames: ['skill'],
    targetModelId: 'config-model',
    targetProviderId: 'config-provider',
    targetSubagentType: 'general',
  };
  assert.deepEqual(buildSubagentSpawnParams({
    config,
    conversationId: 'conversation-1',
    description: '执行 smoke 任务',
    modelId: 'override-model',
    name: '测试分身',
    prompt: '执行 smoke 任务',
    providerId: 'override-provider',
    shouldWriteBack: true,
  }), {
    description: '执行 smoke 任务',
    messages: [{
      content: [{ text: '执行 smoke 任务', type: 'text' }],
      role: 'user',
    }],
    modelId: 'override-model',
    name: '测试分身',
    providerId: 'override-provider',
    subagentType: 'general',
    toolNames: ['skill'],
    writeBack: {
      target: {
        id: 'conversation-1',
        type: 'conversation',
      },
    },
  });
  assert.deepEqual(buildSubagentSendInputParams({
    config,
    conversationId: 'subagent-1',
    description: '继续执行',
    modelId: 'override-model',
    name: '测试分身',
    prompt: '继续执行',
    providerId: 'override-provider',
  }), {
    conversationId: 'subagent-1',
    description: '继续执行',
    messages: [{
      content: [{ text: '继续执行', type: 'text' }],
      role: 'user',
    }],
    modelId: 'override-model',
    name: '测试分身',
    providerId: 'override-provider',
    toolNames: ['skill'],
  });
});
