import type { PluginRuntimePostWriteSummary } from '@garlic-claw/shared';
import type { RuntimeFilesystemDiagnosticEntry, RuntimeFilesystemPostWriteResult } from '../runtime/runtime-filesystem-backend.types';

const MAX_FILES = 5;
const MAX_LINES = 20;
const SEVERITY_SCORE: Record<RuntimeFilesystemDiagnosticEntry['severity'], number> = { error: 100, warning: 10, info: 1, hint: 0 };

export function readRuntimeFilesystemPostWriteSummary(postWrite: RuntimeFilesystemPostWriteResult, options?: { targetPath?: string }): PluginRuntimePostWriteSummary {
  const state = readDiagnosticState(postWrite.diagnostics, options?.targetPath);
  return {
    currentFileDiagnostics: state.current.length,
    formatting: postWrite.formatting ? { kind: postWrite.formatting.kind, label: postWrite.formatting.label } : null,
    nextHint: readNextHint(postWrite.formatting, state),
    omittedRelatedFiles: state.targetPath ? state.omitted : 0,
    relatedFileDiagnostics: state.related.length,
    relatedFiles: state.relatedFileCount,
    relatedFocusPaths: state.relatedFocusPaths,
    severityCounts: countSeverities(postWrite.diagnostics),
    totalDiagnostics: postWrite.diagnostics.length,
    visibleRelatedFiles: state.targetPath ? state.visibleRelatedPaths.length : 0,
    visibleRelatedPaths: state.visibleRelatedPaths,
  };
}

export function renderRuntimeFilesystemPostWriteLines(postWrite: RuntimeFilesystemPostWriteResult, options?: { targetPath?: string }): string[] {
  const state = readDiagnosticState(postWrite.diagnostics, options?.targetPath), lines = postWrite.formatting ? [`Formatting: ${postWrite.formatting.label}`] : [];
  if (postWrite.diagnostics.length === 0) {return [...lines, 'Diagnostics: none', readNextHint(postWrite.formatting, state)].filter((line): line is string => Boolean(line));}
  return [
    ...lines,
    readSummaryLine(state),
    ...state.visibleFiles.map(([path, diagnostics]) => renderDiagnosticBlock(path, diagnostics)),
    ...(state.omitted > 0 ? [`... diagnostics from ${state.omitted} more related file(s) omitted`] : []),
    readNextHint(postWrite.formatting, state),
  ].filter((line): line is string => Boolean(line));
}

function readDiagnosticState(diagnostics: RuntimeFilesystemDiagnosticEntry[], targetPath?: string) {
  const grouped = Array.from(diagnostics.reduce((map, diagnostic) => map.set(diagnostic.path, [...(map.get(diagnostic.path) ?? []), diagnostic]), new Map<string, RuntimeFilesystemDiagnosticEntry[]>()).entries()).sort((left, right) => compareDiagnostics(right[1], left[1]) || left[0].localeCompare(right[0]));
  const current = targetPath ? diagnostics.filter((entry) => entry.path === targetPath) : diagnostics, related = targetPath ? diagnostics.filter((entry) => entry.path !== targetPath) : [];
  const currentFiles = targetPath ? grouped.filter(([path]) => path === targetPath) : [], relatedFiles = targetPath ? grouped.filter(([path]) => path !== targetPath) : grouped;
  const visibleRelatedFiles = targetPath ? relatedFiles.slice(0, MAX_FILES) : relatedFiles.slice(0, MAX_FILES), omitted = targetPath ? Math.max(relatedFiles.length - MAX_FILES, 0) : Math.max(grouped.length - MAX_FILES, 0);
  return {
    targetPath,
    current,
    related,
    relatedFileCount: new Set(related.map((entry) => entry.path)).size,
    relatedFocusPaths: relatedFiles.slice(0, 3).map(([path]) => path),
    visibleRelatedPaths: targetPath ? visibleRelatedFiles.map(([path]) => path) : [],
    visibleFiles: targetPath ? [...currentFiles, ...visibleRelatedFiles] : grouped.slice(0, MAX_FILES),
    omitted,
  };
}

function renderDiagnosticBlock(path: string, diagnostics: RuntimeFilesystemDiagnosticEntry[]): string {
  return ['<diagnostics file="' + path + '">', ...diagnostics.slice(0, MAX_LINES).map((diagnostic) => `${diagnostic.severity.toUpperCase()}${diagnostic.code ? ` ${diagnostic.code}` : ''} [${diagnostic.line}:${diagnostic.column}] ${diagnostic.message}`), ...(diagnostics.length > MAX_LINES ? [`... and ${diagnostics.length - MAX_LINES} more`] : []), '</diagnostics>'].join('\n');
}

function readSummaryLine(state: ReturnType<typeof readDiagnosticState>): string {
  if (!state.targetPath) {return state.visibleFiles.length > 1 ? `Diagnostics: ${state.current.length} issue(s) across ${state.visibleFiles.length + state.omitted} file(s)` : `Diagnostics: ${state.current.length} issue(s)`;}
  if (state.current.length > 0 && state.related.length > 0) {return `Diagnostics: ${state.current.length + state.related.length} issue(s). Current file: ${state.current.length} Related files: ${state.related.length} across ${state.relatedFileCount} file(s)`;}
  if (state.current.length > 0) {return `Diagnostics: ${state.current.length} issue(s) in current file`;}
  return state.relatedFileCount > 1 ? `Diagnostics: ${state.related.length} issue(s) in related files (${state.relatedFileCount} file(s))` : `Diagnostics: ${state.related.length} issue(s) in related file`;
}

function readNextHint(formatting: RuntimeFilesystemPostWriteResult['formatting'], state: ReturnType<typeof readDiagnosticState>): string | null {
  if (hasSeverity(state.current, 'error')) {return `Next: read ${state.targetPath ?? 'the current file'} and fix error diagnostics before continuing edits or writes.`;}
  if (hasSeverity(state.related, 'error')) {return `Next: read related files first: ${state.relatedFocusPaths.join(', ')}. Fix error diagnostics before continuing edits or writes.`;}
  if (hasSeverity(state.current, 'warning')) {return `Next: read ${state.targetPath ?? 'the current file'} and review warning diagnostics before finalizing changes.`;}
  if (hasSeverity(state.related, 'warning')) {return `Next: read related files first: ${state.relatedFocusPaths.join(', ')}. Review warning diagnostics before finalizing changes.`;}
  if (state.current.length > 0) {return `Next: read ${state.targetPath ?? 'the current file'} and review diagnostics before finalizing changes.`;}
  if (state.related.length > 0) {return `Next: read related files first: ${state.relatedFocusPaths.join(', ')}. Review diagnostics before finalizing changes.`;}
  return formatting ? `Next: read ${state.targetPath ?? 'the current file'} to confirm the formatted output before continuing edits or writes.` : null;
}

function countSeverities(diagnostics: RuntimeFilesystemDiagnosticEntry[]): PluginRuntimePostWriteSummary['severityCounts'] {
  return diagnostics.reduce<PluginRuntimePostWriteSummary['severityCounts']>((counts, diagnostic) => ({ ...counts, [diagnostic.severity]: counts[diagnostic.severity] + 1 }), { error: 0, hint: 0, info: 0, warning: 0 });
}

function compareDiagnostics(left: RuntimeFilesystemDiagnosticEntry[], right: RuntimeFilesystemDiagnosticEntry[]): number {
  return sumSeverity(left) - sumSeverity(right) || left.length - right.length;
}

function sumSeverity(diagnostics: RuntimeFilesystemDiagnosticEntry[]): number {
  return diagnostics.reduce((score, diagnostic) => score + SEVERITY_SCORE[diagnostic.severity], 0);
}

function hasSeverity(diagnostics: RuntimeFilesystemDiagnosticEntry[], severity: RuntimeFilesystemDiagnosticEntry['severity']): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === severity);
}
