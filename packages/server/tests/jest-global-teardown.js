const fs = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  const workspaceRoot = path.resolve(__dirname, '..', '..', '..', 'workspace');
  const artifactPath = path.join(workspaceRoot, 'test-artifacts', 'server');
  const runtimePath = path.join(workspaceRoot, 'runtime-workspaces');
  fs.rmSync(artifactPath, { force: true, recursive: true });
  fs.rmSync(runtimePath, { force: true, recursive: true });
};
