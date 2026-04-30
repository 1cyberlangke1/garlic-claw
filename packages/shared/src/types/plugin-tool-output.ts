import type { JsonValue } from './json';

export interface PluginToolTextOutput {
  kind: 'tool:text';
  data?: JsonValue;
  value: string;
}

export interface PluginToolJsonOutput {
  kind: 'tool:json';
  data?: JsonValue;
  value: JsonValue;
}

export type PluginToolOutput = PluginToolJsonOutput | PluginToolTextOutput;
