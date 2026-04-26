import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuntimeToolsSettingsService } from '../../../src/execution/runtime/runtime-tools-settings.service';

describe('RuntimeToolsSettingsService', () => {
  const originalConfigPath = process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH;
  const tempFiles: string[] = [];

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH = originalConfigPath;
    }
    for (const nextPath of tempFiles.splice(0)) {
      fs.rmSync(nextPath, { force: true });
    }
  });

  it('exposes platform-scoped shell backend options in config schema', () => {
    process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH = createTempConfigPath(tempFiles);

    const snapshot = new RuntimeToolsSettingsService().getConfigSnapshot();
    const schema = snapshot.schema;
    if (!schema || schema.type !== 'object') {
      throw new Error('runtime-tools schema is missing');
    }
    const shellBackend = schema.items.shellBackend;
    if (!shellBackend || shellBackend.type !== 'string') {
      throw new Error('shellBackend schema is missing');
    }

    expect(shellBackend.options).toEqual(process.platform === 'win32'
      ? [
          { label: 'PowerShell', value: 'native-shell' },
          { label: 'WSL', value: 'wsl-shell' },
          { label: 'just-bash', value: 'just-bash' },
        ]
      : [{ label: 'bash', value: 'native-shell' }]);
  });

  it('accepts just-bash as a stored shell backend on Windows', () => {
    process.env.GARLIC_CLAW_RUNTIME_TOOLS_CONFIG_PATH = createTempConfigPath(tempFiles);
    const service = new RuntimeToolsSettingsService();

    if (process.platform !== 'win32') {
      expect(service.updateConfig({ shellBackend: 'native-shell' })).toEqual(expect.objectContaining({
        values: { shellBackend: 'native-shell' },
      }));
      return;
    }

    expect(service.updateConfig({ shellBackend: 'just-bash' })).toEqual(expect.objectContaining({
      values: { shellBackend: 'just-bash' },
    }));
    expect(service.readConfiguredShellBackend()).toBe('just-bash');
  });
});

function createTempConfigPath(tempFiles: string[]): string {
  const filePath = path.join(
    os.tmpdir(),
    `gc-runtime-tools-settings-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  tempFiles.push(filePath);
  return filePath;
}
