import type { PluginManifest } from '@garlic-claw/shared';
import type { BuiltinPluginDefinition } from '../builtin-plugin-definition';
import {
  BUILTIN_RUNTIME_BASH_TOOL_CAPABILITY,
  runBuiltinRuntimeBashTool,
} from './runtime-tools/builtin-runtime-bash.plugin-tool';
import {
  BUILTIN_RUNTIME_EDIT_TOOL_CAPABILITY,
  runBuiltinRuntimeEditTool,
} from './runtime-tools/builtin-runtime-edit.plugin-tool';
import {
  BUILTIN_RUNTIME_GLOB_TOOL_CAPABILITY,
  runBuiltinRuntimeGlobTool,
} from './runtime-tools/builtin-runtime-glob.plugin-tool';
import {
  BUILTIN_RUNTIME_GREP_TOOL_CAPABILITY,
  runBuiltinRuntimeGrepTool,
} from './runtime-tools/builtin-runtime-grep.plugin-tool';
import {
  BUILTIN_RUNTIME_READ_TOOL_CAPABILITY,
  runBuiltinRuntimeReadTool,
} from './runtime-tools/builtin-runtime-read.plugin-tool';
import {
  BUILTIN_RUNTIME_WRITE_TOOL_CAPABILITY,
  runBuiltinRuntimeWriteTool,
} from './runtime-tools/builtin-runtime-write.plugin-tool';
import { RUNTIME_TOOLS_CONFIG_SCHEMA } from './runtime-tools/runtime-tools-plugin-config';

const RUNTIME_TOOLS_MANIFEST: PluginManifest = {
  id: 'builtin.runtime-tools',
  name: 'Runtime Tools',
  version: '1.0.0',
  runtime: 'local',
  description: '暴露当前 runtime backend 的命令与文件系统工具。',
  config: RUNTIME_TOOLS_CONFIG_SCHEMA,
  permissions: ['config:read', 'runtime:command', 'runtime:read', 'runtime:write'],
  tools: [
    BUILTIN_RUNTIME_BASH_TOOL_CAPABILITY,
    BUILTIN_RUNTIME_READ_TOOL_CAPABILITY,
    BUILTIN_RUNTIME_GLOB_TOOL_CAPABILITY,
    BUILTIN_RUNTIME_GREP_TOOL_CAPABILITY,
    BUILTIN_RUNTIME_WRITE_TOOL_CAPABILITY,
    BUILTIN_RUNTIME_EDIT_TOOL_CAPABILITY,
  ],
};

export const BUILTIN_RUNTIME_TOOLS_PLUGIN: BuiltinPluginDefinition = {
  governance: { builtinRole: 'system-required', canDisable: false, defaultEnabled: true },
  manifest: RUNTIME_TOOLS_MANIFEST,
  tools: {
    bash: runBuiltinRuntimeBashTool,
    read: runBuiltinRuntimeReadTool,
    glob: runBuiltinRuntimeGlobTool,
    grep: runBuiltinRuntimeGrepTool,
    write: runBuiltinRuntimeWriteTool,
    edit: runBuiltinRuntimeEditTool,
  },
};
