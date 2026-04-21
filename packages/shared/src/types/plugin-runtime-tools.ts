import type { RuntimeBackendKind } from './runtime-permission';

export interface PluginRuntimeCommandParams {
  command: string;
  description: string;
  timeout?: number;
  workdir?: string;
}

export interface PluginRuntimeCommandResult {
  backendKind: RuntimeBackendKind;
  cwd: string;
  exitCode: number;
  sessionId: string;
  stderr: string;
  stdout: string;
  workspaceRoot: string;
}

export interface PluginRuntimeReadParams {
  filePath: string;
  limit?: number;
  offset?: number;
}

export interface PluginRuntimeReadResult {
  output: string;
  path: string;
  truncated: boolean;
  type: 'directory' | 'file';
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

export interface PluginRuntimeWriteResult {
  created: boolean;
  output: string;
  path: string;
}

export interface PluginRuntimeEditParams {
  filePath: string;
  newString: string;
  oldString: string;
  replaceAll?: boolean;
}

export interface PluginRuntimeEditResult {
  occurrences: number;
  output: string;
  path: string;
}
