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

interface NormalizedRuntimeCommandTextOutputOptions {
  maxBytes: number;
  maxLines: number;
  showTruncationDetails: boolean;
}

interface RuntimeCommandRenderedStream {
  output: string;
  truncatedByBytes: boolean;
  truncatedByLines: boolean;
}

export function renderRuntimeCommandTextOutput(
  result: RuntimeCommandRenderableResult,
  options?: RuntimeCommandTextOutputOptions,
): string {
  const normalizedOptions = normalizeRuntimeCommandTextOutputOptions(options);
  const stdout = renderRuntimeCommandStreamOutput(result.stdout, result.stdoutStats, normalizedOptions);
  const stderr = renderRuntimeCommandStreamOutput(result.stderr, result.stderrStats, normalizedOptions);
  return [
    '<bash_result>',
    `cwd: ${result.cwd}`,
    `exit_code: ${result.exitCode}`,
    `status: ${result.exitCode === 0 ? 'success' : 'failed'}`,
    ...readRuntimeCommandDiagnostics(result),
    readRuntimeCommandStreamSummary('stdout', result.stdout, result.stdoutStats, stdout),
    readRuntimeCommandStreamSummary('stderr', result.stderr, result.stderrStats, stderr),
    ...readRuntimeCommandOutputPathLine(result.outputPath, stdout, stderr),
    '<stdout>',
    stdout.output,
    '</stdout>',
    '<stderr>',
    stderr.output,
    '</stderr>',
    '</bash_result>',
  ].join('\n');
}

function readRuntimeCommandOutputPathLine(
  outputPath: string | undefined,
  stdout: RuntimeCommandRenderedStream,
  stderr: RuntimeCommandRenderedStream,
): string[] {
  if (!outputPath) {
    return [];
  }
  if (
    !stdout.truncatedByBytes
    && !stdout.truncatedByLines
    && !stderr.truncatedByBytes
    && !stderr.truncatedByLines
  ) {
    return [];
  }
  return [`full_output_path: ${outputPath}`];
}

function readRuntimeCommandDiagnostics(result: RuntimeCommandRenderableResult): string[] {
  const hasStdout = result.stdout.trim().length > 0;
  const hasStderr = result.stderr.trim().length > 0;
  if (result.exitCode !== 0) {
    return [
      hasStderr
        ? `diagnostic: command failed with exit code ${result.exitCode}; inspect stderr first for the primary error.`
        : `diagnostic: command failed with exit code ${result.exitCode} but produced no stderr; inspect stdout for clues.`,
    ];
  }
  if (hasStderr) {
    return [
      'diagnostic: command succeeded with stderr output; review stderr for warnings or extra diagnostics.',
    ];
  }
  if (!hasStdout) {
    return [
      'diagnostic: command completed without stdout or stderr output.',
    ];
  }
  return [];
}

function renderRuntimeCommandStreamOutput(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  options: NormalizedRuntimeCommandTextOutputOptions,
): RuntimeCommandRenderedStream {
  if (!text) {
    return {
      output: '(empty)',
      truncatedByBytes: false,
      truncatedByLines: false,
    };
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const trailingNewline = normalized.endsWith('\n');
  const trimmedLines = trailingNewline ? lines.slice(0, -1) : lines;
  const slicedLines = options.maxLines > 0
    ? trimmedLines.slice(-options.maxLines)
    : [...trimmedLines];
  let output = slicedLines.join('\n');
  const truncatedByLines = options.maxLines > 0 && slicedLines.length < trimmedLines.length;
  let truncatedByBytes = false;

  while (
    options.maxBytes > 0
    && Buffer.byteLength(output, 'utf8') > options.maxBytes
    && slicedLines.length > 1
  ) {
    slicedLines.shift();
    output = slicedLines.join('\n');
    truncatedByBytes = true;
  }

  if (options.maxBytes > 0 && Buffer.byteLength(output, 'utf8') > options.maxBytes) {
    const buffer = Buffer.from(output, 'utf8');
    let start = buffer.length - options.maxBytes;
    while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
      start += 1;
    }
    output = buffer.subarray(start).toString('utf8');
    truncatedByBytes = true;
  }

  if (!truncatedByLines && !truncatedByBytes) {
    return {
      output: output || '(empty)',
      truncatedByBytes,
      truncatedByLines,
    };
  }

  if (!options.showTruncationDetails) {
    return {
      output: output || '(empty)',
      truncatedByBytes,
      truncatedByLines,
    };
  }

  const normalizedStats = stats ?? readRuntimeCommandStreamStats(text);
  const reasons: string[] = [];
  if (truncatedByLines) {
    reasons.push(`共 ${normalizedStats.lines} 行，仅保留最后 ${slicedLines.length} 行`);
  }
  if (truncatedByBytes) {
    reasons.push(`共 ${normalizedStats.bytes} 字节，仅保留最后 ${options.maxBytes} 字节内的内容`);
  }
  return {
    output: [
      `... output truncated (${reasons.join('，')}) ...`,
      output || '(empty)',
    ].join('\n'),
    truncatedByBytes,
    truncatedByLines,
  };
}

function normalizeRuntimeCommandTextOutputOptions(
  options?: RuntimeCommandTextOutputOptions,
): NormalizedRuntimeCommandTextOutputOptions {
  return {
    maxBytes: normalizeRuntimeCommandOutputLimit(
      options?.maxBytes,
      DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES,
    ),
    maxLines: normalizeRuntimeCommandOutputLimit(
      options?.maxLines,
      DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES,
    ),
    showTruncationDetails: options?.showTruncationDetails ?? true,
  };
}

function readRuntimeCommandStreamStats(text: string): RuntimeCommandStreamStats {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text.length === 0 ? 0 : text.replace(/\r\n/g, '\n').split('\n').length,
  };
}

function readRuntimeCommandStreamSummary(
  label: 'stdout' | 'stderr',
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  rendered: RuntimeCommandRenderedStream,
): string {
  if (!text) {
    return `${label}_summary: empty`;
  }
  const normalizedStats = stats ?? readRuntimeCommandStreamStats(text);
  const truncation = rendered.truncatedByBytes || rendered.truncatedByLines
    ? ' (tail view shown)'
    : '';
  return `${label}_summary: ${normalizedStats.lines} lines, ${normalizedStats.bytes} bytes${truncation}`;
}

function normalizeRuntimeCommandOutputLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}
