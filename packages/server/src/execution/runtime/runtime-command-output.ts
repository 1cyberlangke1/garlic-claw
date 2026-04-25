import type { RuntimeCommandStreamStats } from './runtime-command.types';

export const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES = 200;
export const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES = 16 * 1024;

interface RuntimeCommandRenderableResult {
  cwd: string;
  exitCode: number;
  outputPath?: string;
  stderr: string;
  stderrStats: RuntimeCommandStreamStats;
  stdout: string;
  stdoutStats: RuntimeCommandStreamStats;
}

export interface RuntimeCommandTextOutputOptions {
  maxBytes?: number;
  maxLines?: number;
  showTruncationDetails?: boolean;
}

interface RuntimeCommandRenderedStream {
  output: string;
  truncatedByBytes: boolean;
  truncatedByLines: boolean;
}

interface RuntimeCommandOutputLimits {
  maxBytes: number;
  maxLines: number;
  showTruncationDetails: boolean;
}

export function renderRuntimeCommandTextOutput(
  result: RuntimeCommandRenderableResult,
  options?: RuntimeCommandTextOutputOptions,
): string {
  const stdout = renderRuntimeCommandStream(result.stdout, result.stdoutStats, normalizeRuntimeCommandOutputOptions(options));
  const stderr = renderRuntimeCommandStream(result.stderr, result.stderrStats, normalizeRuntimeCommandOutputOptions(options));
  return [
    '<bash_result>',
    `cwd: ${result.cwd}`,
    `exit_code: ${result.exitCode}`,
    `status: ${result.exitCode === 0 ? 'success' : 'failed'}`,
    ...readRuntimeCommandDiagnostics(result),
    summarizeRuntimeCommandStream('stdout', result.stdout, result.stdoutStats, stdout),
    summarizeRuntimeCommandStream('stderr', result.stderr, result.stderrStats, stderr),
    ...readRuntimeOutputPath(result.outputPath, stdout, stderr),
    '<stdout>',
    stdout.output,
    '</stdout>',
    '<stderr>',
    stderr.output,
    '</stderr>',
    '</bash_result>',
  ].join('\n');
}

function normalizeRuntimeCommandOutputOptions(options?: RuntimeCommandTextOutputOptions): RuntimeCommandOutputLimits {
  return {
    maxBytes: normalizeRuntimeCommandOutputLimit(options?.maxBytes, DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES),
    maxLines: normalizeRuntimeCommandOutputLimit(options?.maxLines, DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES),
    showTruncationDetails: options?.showTruncationDetails ?? true,
  };
}

function renderRuntimeCommandStream(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  limits: RuntimeCommandOutputLimits,
): RuntimeCommandRenderedStream {
  if (!text) {
    return { output: '(empty)', truncatedByBytes: false, truncatedByLines: false };
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  const tail = limits.maxLines > 0 ? lines.slice(-limits.maxLines) : [...lines];
  let output = tail.join('\n');
  const truncatedByLines = limits.maxLines > 0 && tail.length < lines.length;
  let truncatedByBytes = false;
  while (limits.maxBytes > 0 && Buffer.byteLength(output, 'utf8') > limits.maxBytes && tail.length > 1) {
    tail.shift();
    output = tail.join('\n');
    truncatedByBytes = true;
  }
  if (limits.maxBytes > 0 && Buffer.byteLength(output, 'utf8') > limits.maxBytes) {
    output = trimRuntimeCommandBytes(output, limits.maxBytes);
    truncatedByBytes = true;
  }
  if (!limits.showTruncationDetails || (!truncatedByLines && !truncatedByBytes)) {
    return {
      output: output || '(empty)',
      truncatedByBytes,
      truncatedByLines,
    };
  }
  return {
    output: [`... output truncated (${readRuntimeTruncationDetail(text, stats, tail.length, limits.maxBytes, truncatedByLines, truncatedByBytes)}) ...`, output || '(empty)'].join('\n'),
    truncatedByBytes,
    truncatedByLines,
  };
}

function trimRuntimeCommandBytes(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
    start += 1;
  }
  return buffer.subarray(start).toString('utf8');
}

function readRuntimeTruncationDetail(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  keptLines: number,
  maxBytes: number,
  truncatedByLines: boolean,
  truncatedByBytes: boolean,
): string {
  const normalized = stats ?? readRuntimeCommandStreamStats(text);
  return [
    truncatedByLines ? `共 ${normalized.lines} 行，仅保留最后 ${keptLines} 行` : null,
    truncatedByBytes ? `共 ${normalized.bytes} 字节，仅保留最后 ${maxBytes} 字节内的内容` : null,
  ].filter((item): item is string => Boolean(item)).join('，');
}

function readRuntimeCommandDiagnostics(result: RuntimeCommandRenderableResult): string[] {
  const hasStdout = result.stdout.trim().length > 0;
  const hasStderr = result.stderr.trim().length > 0;
  if (result.exitCode !== 0) {
    return [hasStderr
      ? `diagnostic: command failed with exit code ${result.exitCode}; inspect stderr first for the primary error.`
      : `diagnostic: command failed with exit code ${result.exitCode} but produced no stderr; inspect stdout for clues.`];
  }
  if (hasStderr) {
    return ['diagnostic: command succeeded with stderr output; review stderr for warnings or extra diagnostics.'];
  }
  return hasStdout ? [] : ['diagnostic: command completed without stdout or stderr output.'];
}

function summarizeRuntimeCommandStream(
  label: 'stdout' | 'stderr',
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  rendered: RuntimeCommandRenderedStream,
): string {
  if (!text) {
    return `${label}_summary: empty`;
  }
  const normalized = stats ?? readRuntimeCommandStreamStats(text);
  return `${label}_summary: ${normalized.lines} lines, ${normalized.bytes} bytes${rendered.truncatedByBytes || rendered.truncatedByLines ? ' (tail view shown)' : ''}`;
}

function readRuntimeOutputPath(
  outputPath: string | undefined,
  stdout: RuntimeCommandRenderedStream,
  stderr: RuntimeCommandRenderedStream,
): string[] {
  return outputPath && (stdout.truncatedByBytes || stdout.truncatedByLines || stderr.truncatedByBytes || stderr.truncatedByLines)
    ? [`full_output_path: ${outputPath}`]
    : [];
}

function readRuntimeCommandStreamStats(text: string): RuntimeCommandStreamStats {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text.length === 0 ? 0 : text.replace(/\r\n/g, '\n').split('\n').length,
  };
}

function normalizeRuntimeCommandOutputLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
