import type { RuntimeCommandStreamStats } from './runtime-command.types';

const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES = 200;
const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES = 16 * 1024;

interface RuntimeCommandRenderableResult {
  cwd: string;
  exitCode: number;
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

export function renderRuntimeCommandTextOutput(
  result: RuntimeCommandRenderableResult,
  options?: RuntimeCommandTextOutputOptions,
): string {
  const normalizedOptions = normalizeRuntimeCommandTextOutputOptions(options);
  return [
    '<bash_result>',
    `cwd: ${result.cwd}`,
    `exit_code: ${result.exitCode}`,
    '<stdout>',
    renderRuntimeCommandStreamOutput(result.stdout, result.stdoutStats, normalizedOptions),
    '</stdout>',
    '<stderr>',
    renderRuntimeCommandStreamOutput(result.stderr, result.stderrStats, normalizedOptions),
    '</stderr>',
    '</bash_result>',
  ].join('\n');
}

function renderRuntimeCommandStreamOutput(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  options: NormalizedRuntimeCommandTextOutputOptions,
): string {
  if (!text) {
    return '(empty)';
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
    return output || '(empty)';
  }

  if (!options.showTruncationDetails) {
    return output || '(empty)';
  }

  const normalizedStats = stats ?? readRuntimeCommandStreamStats(text);
  const reasons: string[] = [];
  if (truncatedByLines) {
    reasons.push(`共 ${normalizedStats.lines} 行，仅保留最后 ${slicedLines.length} 行`);
  }
  if (truncatedByBytes) {
    reasons.push(`共 ${normalizedStats.bytes} 字节，仅保留最后 ${options.maxBytes} 字节内的内容`);
  }
  return [
    `... output truncated (${reasons.join('，')}) ...`,
    output || '(empty)',
  ].join('\n');
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

function normalizeRuntimeCommandOutputLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}
