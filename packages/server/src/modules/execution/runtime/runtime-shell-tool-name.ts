import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { usesRuntimePowerShellSyntax } from './runtime-shell-command-hints';

export function readRuntimeShellToolName(
  backendKind?: RuntimeBackendKind,
): 'bash' | 'powershell' {
  return backendKind && usesRuntimePowerShellSyntax(backendKind)
    ? 'powershell'
    : 'bash';
}

export function readRuntimeShellToolAliases(
  backendKind?: RuntimeBackendKind,
): Array<'bash' | 'powershell'> {
  const primaryName = readRuntimeShellToolName(backendKind);
  return primaryName === 'powershell'
    ? ['powershell', 'bash']
    : ['bash', 'powershell'];
}

export function isRuntimeShellToolAlias(
  backendKind: RuntimeBackendKind | undefined,
  toolName: string,
): boolean {
  return readRuntimeShellToolAliases(backendKind).includes(
    toolName.trim().toLowerCase() as 'bash' | 'powershell',
  );
}

export function isAbsoluteShellWorkdir(
  backendKind: RuntimeBackendKind | undefined,
  workdir: string,
): boolean {
  const normalized = workdir.trim();
  if (normalized.length === 0) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/u.test(normalized) || normalized.startsWith('\\\\')) {
    return backendKind === 'native-shell' || backendKind === 'wsl-shell';
  }
  return backendKind === 'wsl-shell' && normalized.startsWith('/mnt/');
}
