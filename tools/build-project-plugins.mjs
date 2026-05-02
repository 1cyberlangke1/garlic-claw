import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const pluginsRootPath = path.join(projectRootPath, 'config', 'plugins');

if (!fs.existsSync(pluginsRootPath)) {
  process.exit(0);
}

const pluginDirectoryNames = fs
  .readdirSync(pluginsRootPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

for (const directoryName of pluginDirectoryNames) {
  const pluginRootPath = path.join(pluginsRootPath, directoryName);
  const packageJsonPath = path.join(pluginRootPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    continue;
  }
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf-8'),
  );
  if (!packageJson.scripts?.build) {
    continue;
  }

  const result = process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', 'npm run build'],
        {
          cwd: pluginRootPath,
          stdio: 'inherit',
        },
      )
    : spawnSync('npm', ['run', 'build'], {
        cwd: pluginRootPath,
        stdio: 'inherit',
      });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
