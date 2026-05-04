import type {
  RuntimeFilesystemSkippedEntry,
  RuntimeFilesystemSkippedReason,
} from '../runtime/runtime-filesystem-backend.types';

const SEARCH_DIAGNOSTIC_PREVIEW_LIMIT = 3;

export function renderRuntimeGlobSearchDiagnostics(
  partial: boolean,
  skippedEntries: RuntimeFilesystemSkippedEntry[],
  skippedPaths: string[],
): string[] {
  const inaccessiblePaths = readSkippedPathsByReason(skippedEntries, ['inaccessible']);
  if (inaccessiblePaths.length > 0) {
    return [formatSkippedEntrySummary('search may be incomplete; inaccessible paths were skipped', inaccessiblePaths)];
  }
  if (skippedPaths.length > 0) {
    return [formatSkippedEntrySummary('search may be incomplete; inaccessible paths were skipped', skippedPaths)];
  }
  return partial ? ['(search may be incomplete; some paths were skipped)'] : [];
}

export function renderRuntimeGrepSearchDiagnostics(
  partial: boolean,
  skippedEntries: RuntimeFilesystemSkippedEntry[],
  skippedPaths: string[],
): string[] {
  const diagnostics: string[] = [];
  const binaryPaths = readSkippedPathsByReason(skippedEntries, ['binary']);
  const incompletePaths = readSkippedPathsByReason(skippedEntries, ['inaccessible', 'unreadable']);
  if (binaryPaths.length > 0) {
    diagnostics.push(formatSkippedEntrySummary('non-text files were skipped during search', binaryPaths));
  }
  if (incompletePaths.length > 0) {
    diagnostics.push(formatSkippedEntrySummary('search may be incomplete; some paths could not be searched', incompletePaths));
    return diagnostics;
  }
  if (skippedPaths.length > 0) {
    diagnostics.push(formatSkippedEntrySummary('search may be incomplete; some paths could not be searched', skippedPaths));
    return diagnostics;
  }
  if (partial) {
    diagnostics.push('(search may be incomplete; some paths were skipped)');
  }
  return diagnostics;
}

function readSkippedPathsByReason(
  skippedEntries: RuntimeFilesystemSkippedEntry[],
  reasons: RuntimeFilesystemSkippedReason[],
): string[] {
  const reasonSet = new Set(reasons);
  const paths: string[] = [];
  for (const entry of skippedEntries) {
    if (!reasonSet.has(entry.reason) || paths.includes(entry.path)) {
      continue;
    }
    paths.push(entry.path);
  }
  return paths;
}

function formatSkippedEntrySummary(prefix: string, paths: string[]): string {
  if (paths.length === 0) {
    return `(${prefix})`;
  }
  const visiblePaths = paths.slice(0, SEARCH_DIAGNOSTIC_PREVIEW_LIMIT);
  const hiddenCount = paths.length - visiblePaths.length;
  return [
    `(${prefix}: ${visiblePaths.join(', ')}`,
    hiddenCount > 0 ? `, +${hiddenCount} more` : '',
    ')',
  ].join('');
}
