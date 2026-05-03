import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { RuntimeCommandBackendResult } from './runtime-command.types';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import {
  DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES,
  DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES,
} from './runtime-command-output';
import { joinRuntimeVisiblePath } from './runtime-visible-path';

const RUNTIME_COMMAND_CAPTURE_DIRECTORY = '.garlic-claw/runtime-command-output';

@Injectable()
export class RuntimeCommandCaptureService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
  ) {}

  async captureIfNeeded(result: RuntimeCommandBackendResult): Promise<string | null> {
    if (!shouldCaptureRuntimeCommandOutput(result)) {
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
    await fs.writeFile(hostPath, renderRuntimeCommandCaptureText(result), 'utf8');
    return joinRuntimeVisiblePath(sessionEnvironment.visibleRoot, relativePath);
  }
}

function shouldCaptureRuntimeCommandOutput(result: RuntimeCommandBackendResult): boolean {
  return exceedsRuntimeCommandOutputLimit(result.stdout)
    || exceedsRuntimeCommandOutputLimit(result.stderr);
}

function exceedsRuntimeCommandOutputLimit(text: string): boolean {
  if (!text) {
    return false;
  }
  return Buffer.byteLength(text, 'utf8') > DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES
    || text.replace(/\r\n/g, '\n').split('\n').length > DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES;
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
