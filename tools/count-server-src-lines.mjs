import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const targetDir = path.join(rootDir, 'packages', 'server', 'src');

async function listTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }
    return entry.isFile() && fullPath.endsWith('.ts') ? [fullPath] : [];
  }));
  return files.flat();
}

function countLines(content) {
  return content
    .split(/\r?\n/u)
    .filter((line) => line !== '')
    .length;
}

const files = await listTypeScriptFiles(targetDir);
const counts = await Promise.all(files.map(async (filePath) => ({
  filePath,
  lines: countLines(await fs.readFile(filePath, 'utf8')),
})));
const totalLines = counts.reduce((sum, item) => sum + item.lines, 0);

console.log(JSON.stringify({
  fileCount: counts.length,
  metric: 'non-empty-lines',
  lines: totalLines,
  target: 'packages/server/src/**/*.ts',
}, null, 2));
