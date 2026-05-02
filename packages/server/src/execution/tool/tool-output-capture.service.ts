import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '@garlic-claw/shared';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeToolsSettingsService } from '../runtime/runtime-tools-settings.service';
import { joinRuntimeVisiblePath } from '../runtime/runtime-visible-path';

const TOOL_OUTPUT_CAPTURE_DIRECTORY = '.garlic-claw/tool-output';

export interface ToolOutputCaptureResult {
  fullOutputPath: string;
  outputPath: string;
}

@Injectable()
export class ToolOutputCaptureService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolsSettingsService: RuntimeToolsSettingsService,
  ) {}

  async captureIfNeeded(input: {
    output: unknown;
    outputText: string;
    sessionId?: string;
    toolName: string;
  }): Promise<ToolOutputCaptureResult | null> {
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
    const options = this.runtimeToolsSettingsService.readToolOutputCaptureOptions();
    if (!options.enabled || !sessionId || !shouldCaptureToolOutput(input.outputText, options.maxBytes)) {
      return null;
    }
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId);
    const extension = readToolOutputCaptureExtension(input.output);
    const relativePath = `${TOOL_OUTPUT_CAPTURE_DIRECTORY}/${createToolOutputCaptureFileName(input.toolName, extension)}`;
    const hostPath = path.join(
      sessionEnvironment.sessionRoot,
      ...relativePath.split('/'),
    );
    await fs.mkdir(path.dirname(hostPath), { recursive: true });
    await this.cleanupOldCaptureFiles(path.dirname(hostPath), options.maxFilesPerSession - 1);
    await fs.writeFile(hostPath, input.outputText, 'utf8');
    return {
      fullOutputPath: hostPath,
      outputPath: joinRuntimeVisiblePath(sessionEnvironment.visibleRoot, relativePath),
    };
  }

  private async cleanupOldCaptureFiles(directoryPath: string, keepCount: number): Promise<void> {
    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      const files = await Promise.all(entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const filePath = path.join(directoryPath, entry.name);
          const stats = await fs.stat(filePath);
          return {
            filePath,
            modifiedAt: stats.mtimeMs,
          };
        }));
      const staleFiles = files
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
        .slice(Math.max(0, keepCount));
      await Promise.all(staleFiles.map(async ({ filePath }) => fs.rm(filePath, { force: true })));
    } catch {
      // 自动清理失败不应阻断主工具执行。
    }
  }
}

function shouldCaptureToolOutput(outputText: string, maxBytes: number): boolean {
  return maxBytes > 0 && Buffer.byteLength(outputText, 'utf8') > maxBytes;
}

function createToolOutputCaptureFileName(toolName: string, extension: string): string {
  const normalizedToolName = toolName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'tool';
  return `${normalizedToolName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

function readToolOutputCaptureExtension(output: unknown): 'json' | 'txt' {
  return typeof output === 'string' ? 'txt' : 'json';
}

export function renderToolOutputCaptureText(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(sanitizeToolOutputCaptureValue(output), null, 2);
}

function sanitizeToolOutputCaptureValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeToolOutputCaptureValue(entry));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([key, entryValue]) => (
        entryValue === undefined ? [] : [[key, sanitizeToolOutputCaptureValue(entryValue)]]
      )),
    ) as JsonValue;
  }
  return String(value);
}
