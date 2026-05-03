import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { RuntimeCommandBackendResult } from './runtime-command.types';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { RuntimeToolsSettingsService } from './runtime-tools-settings.service';
import { joinRuntimeVisiblePath } from './runtime-visible-path';

const RUNTIME_COMMAND_CAPTURE_DIRECTORY = '.garlic-claw/runtime-command-output';

@Injectable()
export class RuntimeCommandCaptureService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolsSettingsService: RuntimeToolsSettingsService,
  ) {}

  async captureIfNeeded(result: RuntimeCommandBackendResult): Promise<string | null> {
    const captureOptions = this.runtimeToolsSettingsService.readToolOutputCaptureOptions();
    if (!captureOptions.enabled || !shouldCaptureRuntimeCommandOutput(result, captureOptions.maxBytes)) {
      return null;
    }
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(
      result.sessionId,
    );
    const relativePath = `${RUNTIME_COMMAND_CAPTURE_DIRECTORY}/${createRuntimeCommandCaptureFileName()}`;
    const hostPath = path.join(
      sessionEnvironment.sessionRoot,
      ...relativePath.split('/'),
    );
    await fs.mkdir(path.dirname(hostPath), { recursive: true });
    await cleanupOldRuntimeCommandCaptureFiles(path.dirname(hostPath), captureOptions.maxFilesPerSession - 1);
    await fs.writeFile(hostPath, renderRuntimeCommandCaptureText(result), 'utf8');
    return joinRuntimeVisiblePath(sessionEnvironment.visibleRoot, relativePath);
  }
}

function shouldCaptureRuntimeCommandOutput(
  result: RuntimeCommandBackendResult,
  maxBytes: number,
): boolean {
  return exceedsRuntimeCommandOutputLimit(result.stdout, maxBytes)
    || exceedsRuntimeCommandOutputLimit(result.stderr, maxBytes);
}

function exceedsRuntimeCommandOutputLimit(text: string, maxBytes: number): boolean {
  if (!text) {
    return false;
  }
  return maxBytes > 0 && Buffer.byteLength(text, 'utf8') > maxBytes;
}

function createRuntimeCommandCaptureFileName(): string {
  return `command-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.txt`;
}

function renderRuntimeCommandCaptureText(result: RuntimeCommandBackendResult): string {
  return [
    '<runtime_command_output>',
    `cwd: ${result.cwd}`,
    `exit_code: ${result.exitCode}`,
    '<stdout>',
    result.stdout || '(empty)',
    '</stdout>',
    '<stderr>',
    result.stderr || '(empty)',
    '</stderr>',
    '</runtime_command_output>',
  ].join('\n');
}

async function cleanupOldRuntimeCommandCaptureFiles(
  directoryPath: string,
  keepCount: number,
): Promise<void> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files = await Promise.all(entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = path.join(directoryPath, entry.name);
        const stats = await fs.stat(filePath);
        return { filePath, modifiedAt: stats.mtimeMs };
      }));
    const staleFiles = files
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(Math.max(0, keepCount));
    await Promise.all(staleFiles.map(async ({ filePath }) => fs.rm(filePath, { force: true })));
  } catch {
    // 自动清理失败不应阻断主命令执行。
  }
}
