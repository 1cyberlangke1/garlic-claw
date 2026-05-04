import * as fs from 'node:fs';
import * as path from 'node:path';

export type RuntimeWindowsPowerShellVariant = 'powershell' | 'pwsh';

export function listWindowsPowerShellCommandCandidates(): string[] {
  return ['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell'];
}

export function readWindowsPowerShellExecutableCandidates(): string[] {
  const candidatePaths = new Set<string>();
  const programFiles = process.env.ProgramFiles?.trim();
  const programFilesX86 = process.env['ProgramFiles(x86)']?.trim();
  const systemRoot = process.env.SystemRoot?.trim();
  const pushCandidate = (candidatePath: string | undefined) => {
    const normalized = candidatePath?.trim();
    if (!normalized) {
      return;
    }
    candidatePaths.add(normalized);
  };
  if (programFiles) {
    pushCandidate(path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'));
  }
  if (programFilesX86) {
    pushCandidate(path.join(programFilesX86, 'PowerShell', '7', 'pwsh.exe'));
  }
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const basePath of pathEntries) {
    pushCandidate(path.join(basePath, 'pwsh.exe'));
    pushCandidate(path.join(basePath, 'pwsh'));
  }
  if (systemRoot) {
    pushCandidate(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  }
  for (const basePath of pathEntries) {
    pushCandidate(path.join(basePath, 'powershell.exe'));
    pushCandidate(path.join(basePath, 'powershell'));
  }
  return [...candidatePaths];
}

export function hasWindowsPowerShellRuntime(): boolean {
  return readWindowsPowerShellExecutableCandidates().some((candidatePath) => fs.existsSync(candidatePath));
}

export function readWindowsPowerShellVariant(): RuntimeWindowsPowerShellVariant {
  for (const candidatePath of readWindowsPowerShellExecutableCandidates()) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }
    return candidatePath.toLowerCase().includes('pwsh') ? 'pwsh' : 'powershell';
  }
  return 'powershell';
}

export function supportsWindowsPowerShellAndAnd(): boolean {
  return readWindowsPowerShellVariant() === 'pwsh';
}
