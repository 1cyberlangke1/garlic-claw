import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { GLOB_TOOL_PARAMETERS } from '../../../../execution/glob/glob-tool.service';
import { renderRuntimeGlobSearchDiagnostics } from '../../../../execution/file/runtime-search-diagnostics';
import {
  renderRuntimeSearchEmptyHint,
  renderRuntimeSearchReadFollowUpHint,
  renderRuntimeSearchSuggestedReadHint,
  renderRuntimeSearchTotalSummary,
  renderRuntimeSearchTruncationSummary,
} from '../../../../execution/file/runtime-search-result-report';
import {
  globBuiltinRuntimePaths,
  readBuiltinRuntimeOptionalString,
  readBuiltinRuntimeRequiredString,
} from './runtime-tools-plugin-runtime';
import { createRuntimeToolTextResult } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_GLOB_TOOL_CAPABILITY: PluginCapability = {
  name: 'glob',
  description: [
    '在当前 backend 可见路径内按 glob 模式列出文件。',
    '结果返回 backend 可见路径，不执行任何命令。',
  ].join('\n'),
  parameters: GLOB_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeGlobTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const result = await globBuiltinRuntimePaths(context, {
    pattern: readBuiltinRuntimeRequiredString(params.pattern, 'glob.pattern'),
    ...(readBuiltinRuntimeOptionalString(params.path) ? { path: readBuiltinRuntimeOptionalString(params.path) } : {}),
  });
  return createRuntimeToolTextResult(renderRuntimeGlobToolOutput(result, readBuiltinRuntimeRequiredString(params.pattern, 'glob.pattern')));
};

function renderRuntimeGlobToolOutput(
  result: Awaited<ReturnType<typeof globBuiltinRuntimePaths>>,
  pattern: string,
): string {
  return [
    '<glob_result>',
    `Base: ${result.globResult.basePath}`,
    ...result.overlay,
    `Pattern: ${pattern}`,
    '<matches>',
    ...(result.globResult.matches.length > 0 ? result.globResult.matches : ['(no matches)']),
    result.globResult.truncated
      ? renderRuntimeSearchTruncationSummary({
        continuationHint: 'Refine path or pattern to continue.',
        shown: result.globResult.matches.length,
        total: result.globResult.totalMatches,
      })
      : renderRuntimeSearchTotalSummary({
        emptyHint: renderRuntimeSearchEmptyHint(),
        followUpHint: result.globResult.totalMatches > 0 ? renderRuntimeSearchReadFollowUpHint('glob') : undefined,
        total: result.globResult.totalMatches,
      }),
    renderRuntimeSearchSuggestedReadHint(result.globResult.matches),
    ...renderRuntimeGlobSearchDiagnostics(
      result.globResult.partial,
      result.globResult.skippedEntries,
      result.globResult.skippedPaths,
    ),
    '</matches>',
    '</glob_result>',
  ].filter((entry): entry is string => Boolean(entry)).join('\n');
}
