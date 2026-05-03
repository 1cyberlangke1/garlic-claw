export function renderRuntimeSearchTruncationSummary(input: {
  shown: number;
  total: number;
  continuationHint: string;
}): string {
  const hidden = Math.max(0, input.total - input.shown);
  return `(showing first ${input.shown} of ${input.total} matches${hidden > 0 ? `, ${hidden} hidden` : ''}. ${input.continuationHint})`;
}

export function renderRuntimeSearchTotalSummary(input: {
  emptyHint?: string;
  total: number;
  followUpHint?: string;
}): string {
  return input.total === 0 && input.emptyHint
    ? `(total matches: 0. ${input.emptyHint})`
    : input.followUpHint
      ? `(total matches: ${input.total}. ${input.followUpHint})`
      : `(total matches: ${input.total})`;
}

export function renderRuntimeSearchEmptyHint(include?: string): string {
  return include ? 'Refine path, include or pattern and retry.' : 'Refine path or pattern and retry.';
}

export function renderRuntimeGrepContinuationHint(include?: string): string {
  return include ? 'Refine path, include or pattern to continue.' : 'Refine path or pattern to continue.';
}

export function renderRuntimeSearchReadFollowUpHint(toolName: 'glob' | 'grep'): string {
  return toolName === 'glob'
    ? 'Use read on a matching path to inspect content, then edit or write if you need changes.'
    : 'Use read on a matching file to inspect surrounding context, then edit or write if you need changes.';
}

export function renderRuntimeSearchSuggestedReadHint(
  matches: Array<string | { virtualPath: string }>,
): string | undefined {
  const path = readRuntimeSearchSuggestedReadPath(matches);
  return path ? `(suggested next read: ${path})` : undefined;
}

export function readRuntimeSearchSuggestedReadPath(
  matches: Array<string | { virtualPath: string }>,
): string | undefined {
  const candidates = [...matches.reduce((map, match) => {
    const virtualPath = typeof match === 'string' ? match : match.virtualPath;
    if (!virtualPath) {
      return map;
    }
    const existing = map.get(virtualPath);
    if (existing) {
      existing.hits += 1;
      return map;
    }
    map.set(virtualPath, {
      depth: virtualPath.replace(/\\/g, '/').split('/').filter(Boolean).length,
      hits: 1,
      path: virtualPath,
    });
    return map;
  }, new Map<string, { depth: number; hits: number; path: string }>()).values()];
  candidates.sort((left, right) => (
    right.hits - left.hits
    || left.depth - right.depth
    || left.path.length - right.path.length
    || left.path.localeCompare(right.path)
  ));
  return candidates[0]?.path;
}

export function renderRuntimeMissingPathNextStep(toolName: 'read' | 'glob' | 'grep'): string {
  return toolName === 'glob'
    ? '可继续操作：请改用上述路径之一重新 glob，或先 glob 上级目录缩小范围。'
    : toolName === 'grep'
      ? '可继续操作：请改用上述路径之一重新 grep，或先 glob 上级目录确认搜索范围。'
      : '可继续操作：请改用上述路径之一重新 read，或先 read 上级目录确认路径。';
}
