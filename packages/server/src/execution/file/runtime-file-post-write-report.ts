import type {
  RuntimeFilesystemDiagnosticEntry,
  RuntimeFilesystemPostWriteResult,
} from '../runtime/runtime-filesystem-backend.types';

const MAX_DIAGNOSTIC_LINES_PER_FILE = 20;

export function renderRuntimeFilesystemPostWriteLines(postWrite: RuntimeFilesystemPostWriteResult): string[] {
  const lines: string[] = [];
  if (postWrite.formatting) {
    lines.push(`Formatting: ${postWrite.formatting.label}`);
  }
  if (postWrite.diagnostics.length === 0) {
    lines.push('Diagnostics: none');
    return lines;
  }
  const diagnosticsByFile = groupRuntimeDiagnosticsByFile(postWrite.diagnostics);
  lines.push(
    diagnosticsByFile.length > 1
      ? `Diagnostics: ${postWrite.diagnostics.length} issue(s) across ${diagnosticsByFile.length} file(s)`
      : `Diagnostics: ${postWrite.diagnostics.length} issue(s)`,
  );
  for (const [filePath, diagnostics] of diagnosticsByFile) {
    lines.push(renderRuntimeDiagnosticBlock(filePath, diagnostics));
  }
  return lines;
}

function groupRuntimeDiagnosticsByFile(
  diagnostics: RuntimeFilesystemDiagnosticEntry[],
): Array<[string, RuntimeFilesystemDiagnosticEntry[]]> {
  const grouped = new Map<string, RuntimeFilesystemDiagnosticEntry[]>();
  for (const diagnostic of diagnostics) {
    const current = grouped.get(diagnostic.path) ?? [];
    current.push(diagnostic);
    grouped.set(diagnostic.path, current);
  }
  return Array.from(grouped.entries());
}

function renderRuntimeDiagnosticBlock(filePath: string, diagnostics: RuntimeFilesystemDiagnosticEntry[]): string {
  const visibleDiagnostics = diagnostics.slice(0, MAX_DIAGNOSTIC_LINES_PER_FILE);
  const suffix = diagnostics.length > MAX_DIAGNOSTIC_LINES_PER_FILE
    ? [`... and ${diagnostics.length - MAX_DIAGNOSTIC_LINES_PER_FILE} more`]
    : [];
  return [
    `<diagnostics file="${filePath}">`,
    ...visibleDiagnostics.map((diagnostic) => formatRuntimeDiagnosticLine(diagnostic)),
    ...suffix,
    '</diagnostics>',
  ].join('\n');
}

function formatRuntimeDiagnosticLine(diagnostic: RuntimeFilesystemDiagnosticEntry): string {
  const severity = diagnostic.severity.toUpperCase();
  const code = diagnostic.code ? ` ${diagnostic.code}` : '';
  return `${severity}${code} [${diagnostic.line}:${diagnostic.column}] ${diagnostic.message}`;
}
