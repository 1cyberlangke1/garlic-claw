export function renderRuntimeSearchTruncationSummary(input: {
  shown: number;
  total: number;
  continuationHint: string;
}): string {
  const hidden = Math.max(0, input.total - input.shown);
  const hiddenLabel = hidden > 0 ? `, ${hidden} hidden` : '';
  return `(showing first ${input.shown} of ${input.total} matches${hiddenLabel}. ${input.continuationHint})`;
}

export function renderRuntimeGrepContinuationHint(include?: string): string {
  return include
    ? 'Refine path, include or pattern to continue.'
    : 'Refine path or pattern to continue.';
}
