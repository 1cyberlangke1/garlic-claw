const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', 'workspace');
const TEST_RUNTIME = path.join(WORKSPACE_ROOT, 'test-artifacts', 'server', 'runtime-workspaces');

module.exports = async () => {
  // 清理上次的测试产物
  fs.rmSync(path.join(WORKSPACE_ROOT, 'test-artifacts', 'server'), { force: true, recursive: true });
  // 测试 runtime workspace 隔离到测试目录，不污染真实聊天数据
  process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = TEST_RUNTIME;
  fs.mkdirSync(TEST_RUNTIME, { recursive: true });
};
