const fs = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  const artifactPath = path.resolve(__dirname, '..', '..', '..', 'workspace', 'test-artifacts', 'server');
  fs.rmSync(artifactPath, { force: true, recursive: true });
  delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
};
