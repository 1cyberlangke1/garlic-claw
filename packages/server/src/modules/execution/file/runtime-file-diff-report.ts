import type { RuntimeFilesystemDiffSummary } from './runtime-file-diff';

const MAX_PATCH_PREVIEW_LINES = 20;

export function renderRuntimeFilesystemDiffLines(
  diff: RuntimeFilesystemDiffSummary | null,
): string[] {
  if (!diff?.patch.trim()) {
    return [];
  }
  const patchLines = diff.patch.split('\n');
  const visibleLines = patchLines.slice(0, MAX_PATCH_PREVIEW_LINES);
  return [
    '<patch>',
    ...visibleLines,
    ...(patchLines.length > MAX_PATCH_PREVIEW_LINES
      ? [`... and ${patchLines.length - MAX_PATCH_PREVIEW_LINES} more patch line(s)`]
      : []),
    '</patch>',
  ];
}
