import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readRuntimeToolsConfiguredShellBackend,
  RuntimeToolsSettingsService,
} from '../../../src/execution/runtime/runtime-tools-settings.service';

describe('RuntimeToolsSettingsService', () => {
  const originalConfigPath = process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
  const tempFiles: string[] = [];

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    } else {
      process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = originalConfigPath;
    }
    for (const nextPath of tempFiles.splice(0)) {
      fs.rmSync(nextPath, { force: true, recursive: true });
    }
  });

  it('exposes platform-scoped shell backend options in config schema', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);

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
          { label: 'just-bash', value: 'just-bash' },
          { label: 'PowerShell', value: 'native-shell' },
          { label: 'WSL', value: 'wsl-shell' },
        ]
      : [{ label: 'bash', value: 'native-shell' }]);
    expect(shellBackend.defaultValue).toBe(process.platform === 'win32' ? 'just-bash' : 'native-shell');
  });

  it('accepts just-bash as a stored shell backend on Windows', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);
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

  it('copies settings.example.json when settings.json is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-settings-example-'));
    const configPath = path.join(tempDir, 'settings.json');
    const examplePath = path.join(tempDir, 'settings.example.json');
    tempFiles.push(tempDir);
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = configPath;
    fs.writeFileSync(examplePath, JSON.stringify({
      runtimeTools: {
        shellBackend: 'native-shell',
      },
    }, null, 2), 'utf-8');

    const service = new RuntimeToolsSettingsService();

    expect(service.getStoredConfig()).toEqual({
      shellBackend: 'native-shell',
    });
    expect(fs.existsSync(configPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).toEqual({
      runtimeTools: {
        shellBackend: 'native-shell',
      },
    });
  });

  it('falls back to just-bash when native-shell is configured on Windows without PowerShell', () => {
    const originalPath = process.env.PATH;
    const originalSystemRoot = process.env.SystemRoot;
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-tools-shell-'));

    try {
      process.env.PATH = fakeRoot;
      process.env.SystemRoot = path.join(fakeRoot, 'missing-system-root');

      expect(readRuntimeToolsConfiguredShellBackend({ shellBackend: 'native-shell' }, 'win32' as NodeJS.Platform)).toBe('just-bash');
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalSystemRoot === undefined) {
        delete process.env.SystemRoot;
      } else {
        process.env.SystemRoot = originalSystemRoot;
      }
      fs.rmSync(fakeRoot, { force: true, recursive: true });
    }
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
