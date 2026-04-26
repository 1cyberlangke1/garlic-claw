import type { PluginToolHandler } from '@garlic-claw/plugin-sdk/authoring';
import type { PluginHostFacadeMethods } from '@garlic-claw/plugin-sdk/host';
import type { PluginCapability } from '@garlic-claw/shared';
import { GREP_TOOL_PARAMETERS } from '../../../../execution/grep/grep-tool.service';
import { renderRuntimeGrepSearchDiagnostics } from '../../../../execution/file/runtime-search-diagnostics';
import {
  renderRuntimeGrepContinuationHint,
  renderRuntimeSearchEmptyHint,
  renderRuntimeSearchReadFollowUpHint,
  renderRuntimeSearchSuggestedReadHint,
  renderRuntimeSearchTotalSummary,
  renderRuntimeSearchTruncationSummary,
} from '../../../../execution/file/runtime-search-result-report';
import {
  grepBuiltinRuntimeContent,
  readBuiltinRuntimeOptionalString,
  readBuiltinRuntimeRequiredString,
} from './runtime-tools-plugin-runtime';
import { createRuntimeToolTextResult } from './runtime-tools-plugin-result';

export const BUILTIN_RUNTIME_GREP_TOOL_CAPABILITY: PluginCapability = {
  name: 'grep',
  description: [
    '在当前 backend 可见路径内按正则搜索文本文件内容。',
    '会跳过二进制文件；include 可进一步限制参与搜索的文件。',
  ].join('\n'),
  parameters: GREP_TOOL_PARAMETERS,
};

export const runBuiltinRuntimeGrepTool: PluginToolHandler<PluginHostFacadeMethods> = async (params, context) => {
  const pattern = readBuiltinRuntimeRequiredString(params.pattern, 'grep.pattern');
  const include = readBuiltinRuntimeOptionalString(params.include);
  const searchPath = readBuiltinRuntimeOptionalString(params.path);
  const result = await grepBuiltinRuntimeContent(context, {
    pattern,
    ...(include ? { include } : {}),
    ...(searchPath ? { path: searchPath } : {}),
  });
  return createRuntimeToolTextResult(
    renderRuntimeGrepToolOutput(
      result,
      pattern,
      include,
    ),
  );
};

function renderRuntimeGrepToolOutput(
  result: Awaited<ReturnType<typeof grepBuiltinRuntimeContent>>,
  pattern: string,
  include?: string,
): string {
  return [
    '<grep_result>',
    `Base: ${result.grepResult.basePath}`,
    ...result.overlay,
    `Pattern: ${pattern}`,
    include ? `Include: ${include}` : undefined,
    '<matches>',
    ...buildRuntimeGrepOutput(result.grepResult.matches),
    result.grepResult.matches.length > 0 ? undefined : '(no matches)',
    result.grepResult.truncated
      ? renderRuntimeSearchTruncationSummary({
        continuationHint: renderRuntimeGrepContinuationHint(include),
        shown: result.grepResult.matches.length,
        total: result.grepResult.totalMatches,
      })
      : renderRuntimeSearchTotalSummary({
        emptyHint: renderRuntimeSearchEmptyHint(include),
        followUpHint: result.grepResult.totalMatches > 0 ? renderRuntimeSearchReadFollowUpHint('grep') : undefined,
        total: result.grepResult.totalMatches,
      }),
    renderRuntimeSearchSuggestedReadHint(result.grepResult.matches),
    ...renderRuntimeGrepSearchDiagnostics(
      result.grepResult.partial,
      result.grepResult.skippedEntries,
      result.grepResult.skippedPaths,
    ),
    '</matches>',
    '</grep_result>',
  ].filter((entry): entry is string => Boolean(entry)).join('\n');
}

function buildRuntimeGrepOutput(
  rows: Awaited<ReturnType<typeof grepBuiltinRuntimeContent>>['grepResult']['matches'],
): string[] {
  const output: string[] = [];
  let currentPath = '';
  for (const row of rows) {
    if (row.virtualPath !== currentPath) {
      currentPath = row.virtualPath;
      if (output.length > 0) {
        output.push('');
      }
      output.push(`${row.virtualPath}:`);
    }
    output.push(`  ${row.line}: ${row.text}`);
  }
  return output;
}
