import type { RuntimeBackendKind } from './runtime-permission';

export interface PluginRuntimeCommandParams {
  backendKind?: RuntimeBackendKind;
  command: string;
  description: string;
  timeout?: number;
  workdir?: string;
}

export interface PluginRuntimeCommandStreamStats {
  bytes: number;
  lines: number;
}

export interface PluginRuntimeCommandResult {
  backendKind: RuntimeBackendKind;
  cwd: string;
  exitCode: number;
  outputPath?: string;
  sessionId: string;
  stderr: string;
  stderrStats: PluginRuntimeCommandStreamStats;
  stdout: string;
  stdoutStats: PluginRuntimeCommandStreamStats;
}

export interface PluginRuntimeReadParams {
  filePath: string;
  limit?: number;
  offset?: number;
}

export interface PluginRuntimeReadResult {
  loaded: string[];
  output: string;
  path: string;
  truncated: boolean;
  type: 'binary' | 'directory' | 'file' | 'image' | 'pdf';
}

export interface PluginRuntimeGlobParams {
  path?: string;
  pattern: string;
}

export interface PluginRuntimeGlobResult {
  count: number;
  output: string;
  truncated: boolean;
}

export interface PluginRuntimeGrepParams {
  include?: string;
  path?: string;
  pattern: string;
}

export interface PluginRuntimeGrepResult {
  matches: number;
  output: string;
  truncated: boolean;
}

export interface PluginRuntimeWriteParams {
  content: string;
  filePath: string;
}

export interface PluginRuntimeFileDiffSummary {
  additions: number;
  afterLineCount: number;
  beforeLineCount: number;
  deletions: number;
  patch: string;
}

export interface PluginRuntimeFormattingSummary {
  kind: string;
  label: string;
}

export interface PluginRuntimeDiagnosticSeverityCounts {
  error: number;
  hint: number;
  info: number;
  warning: number;
}

export interface PluginRuntimePostWriteSummary {
  currentFileDiagnostics: number;
  formatting: PluginRuntimeFormattingSummary | null;
  nextHint: string | null;
  omittedRelatedFiles: number;
  relatedFileDiagnostics: number;
  relatedFiles: number;
  relatedFocusPaths: string[];
  severityCounts: PluginRuntimeDiagnosticSeverityCounts;
  totalDiagnostics: number;
  visibleRelatedFiles: number;
  visibleRelatedPaths: string[];
}

export interface PluginRuntimeWriteResult {
  created: boolean;
  diff?: PluginRuntimeFileDiffSummary | null;
  lineCount?: number;
  output: string;
  path: string;
  postWriteSummary: PluginRuntimePostWriteSummary;
  size?: number;
}

export interface PluginRuntimeEditParams {
  filePath: string;
  newString: string;
  oldString: string;
  replaceAll?: boolean;
}

export interface PluginRuntimeEditResult {
  diff?: PluginRuntimeFileDiffSummary;
  occurrences: number;
  output: string;
  path: string;
  postWriteSummary: PluginRuntimePostWriteSummary;
  strategy?: string;
}
