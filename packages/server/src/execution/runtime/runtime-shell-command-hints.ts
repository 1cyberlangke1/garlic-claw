import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { normalizeRuntimeVisiblePath } from './runtime-visible-path';
import { supportsWindowsPowerShellAndAnd } from './runtime-powershell-variant';

const SINGLE_QUOTED_LITERAL_PREFIX = '__GARLIC_CLAW_SINGLE_QUOTED__', MAX_PREVIEW_ITEMS = 3;
const COMMAND_ALIASES = new Map<string, string>([['gc', 'get-content'], ['irm', 'invoke-restmethod'], ['iwr', 'invoke-webrequest'], ['copy', 'copy-item'], ['move', 'move-item'], ['sc', 'set-content'], ['ac', 'add-content'], ['sl', 'set-location'], ['cpi', 'copy-item'], ['mi', 'move-item'], ['ni', 'new-item'], ['md', 'mkdir'], ['rd', 'remove-item'], ['ri', 'remove-item'], ['del', 'remove-item'], ['erase', 'remove-item'], ['ren', 'rename-item']]);
const FILE_COMMANDS = new Set(['cd', 'pushd', 'popd', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown', 'tar', 'get-content', 'out-file', 'set-content', 'add-content', 'copy-item', 'move-item', 'remove-item', 'new-item', 'rename-item', 'set-location', 'push-location']);
const CD_COMMANDS = new Set(['cd', 'pushd', 'popd', 'set-location', 'push-location']);
const WRITE_COMMANDS = new Set(['cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown', 'tar', 'out-file', 'set-content', 'add-content', 'copy-item', 'invoke-webrequest', 'move-item', 'remove-item', 'new-item', 'rename-item']);
const NETWORK_COMMANDS = new Set(['curl', 'wget', 'fetch', 'nc', 'telnet', 'ssh', 'scp', 'sftp', 'invoke-webrequest', 'invoke-restmethod']);
const GIT_NETWORK_SUBCOMMANDS = new Set(['clone', 'fetch', 'pull']), PACKAGE_MANAGER_COMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun']), PACKAGE_MANAGER_NETWORK_SUBCOMMANDS = new Set(['install', 'add']);
const BASH_CONTROL_WORDS = new Set(['do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'select', 'then', 'until', 'while']), POWERSHELL_CONTROL_WORDS = new Set(['begin', 'catch', 'do', 'else', 'elseif', 'end', 'filter', 'finally', 'for', 'foreach', 'function', 'if', 'in', 'param', 'process', 'switch', 'trap', 'try', 'until', 'while']);
const SHELL_SEPARATORS = new Set(['&&', '||', ';', '|', '(', ')', '{', '}']);
const FLAG_SETS = {
  curlWrite: new Set(['-o', '--output']), gitArchiveWrite: new Set(['-o', '--output']), gitCloneWrite: new Set(['--separate-git-dir']), gitFormatPatchWrite: new Set(['-o', '--output-directory']), gitInitValue: new Set(['-b', '-c', '--initial-branch', '--object-format', '--ref-format', '--template']),
  gitSubmoduleAddValue: new Set(['-b', '--branch', '--depth', '--name', '--reference']), gitWorktreeAddValue: new Set(['-b', '-B', '--orphan', '--reason']), joinPath: new Set(['-path', '-childpath', '-additionalchildpath']), joinPathChild: new Set(['-childpath', '-additionalchildpath']), joinPathPath: new Set(['-path']),
  outFile: new Set(['-filepath', '-literalpath', '-inputobject', '-encoding', '-width']), path: new Set(['-path', '-filepath', '-literalpath', '-destination', '-outfile', '-outputfile']), basePath: new Set(['-path', '-literalpath']), destination: new Set(['-destination']), content: new Set(['-value', '-encoding', '-delimiter', '-stream']),
  newItem: new Set(['-path', '-literalpath', '-name', '-itemtype', '-value']), renameItem: new Set(['-path', '-literalpath', '-newname']), removeItem: new Set(['-path', '-literalpath', '-include', '-exclude', '-filter', '-stream']), name: new Set(['-name']), newName: new Set(['-newname']),
  copyMoveDestination: new Set(['-t', '--target-directory']), tarCreate: new Set(['--append', '--catenate', '--concatenate', '--create', '--update']), tarExtract: new Set(['--extract', '--get']), tarFile: new Set(['--file']), tarDirectory: new Set(['--directory']), wgetWrite: new Set(['-O', '--output-document', '--output-file', '-P', '--directory-prefix']),
} as const;
const POWERSHELL_ENV_PATTERNS = [/^\$env:([A-Za-z_][A-Za-z0-9_]*)(.*)$/iu, /^\$\{env:([^}]+)\}(.*)$/iu] as const, POSIX_ENV_PATTERNS = [/^\$([A-Za-z_][A-Za-z0-9_]*)(.*)$/u, /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}(.*)$/u] as const;
const SHORT_TAR_CREATE_FLAGS = ['c', 'r', 'u'] as const, SHORT_TAR_EXTRACT_FLAGS = ['x'] as const;

export interface RuntimeShellCommandHintMetadata {
  absolutePaths?: string[]; externalAbsolutePaths?: string[]; externalWritePaths?: string[]; fileCommands?: string[]; networkCommands?: string[]; parentTraversalPaths?: string[];
  networkTouchesExternalPath?: boolean; redundantCdWithWorkdir?: boolean; usesCd?: boolean; usesNetworkCommand?: boolean; usesParentTraversal?: boolean; usesWindowsAndAnd?: boolean; writesExternalPath?: boolean;
}
export interface RuntimeShellCommandHints { metadata?: RuntimeShellCommandHintMetadata; summary?: string; }
interface ReadRuntimeShellCommandHintsInput { backendKind: RuntimeBackendKind; command: string; visibleRoot: string; workdir?: string; }
interface RuntimeShellEntry { kind: 'separator' | 'token'; text: string; } interface RuntimeShellSegment { command: string; args: string[]; tokens: string[]; }
interface RuntimeOptionValueMatch { attachedValue?: string; takesNextValue: boolean; } interface RuntimePowerShellTargetRule { fallback: 'destination' | 'path'; positionalValueFlags: Set<string>; buildPath?: (basePath: string, leafName: string) => string; leafFlags?: Set<string>; pathFlags?: Set<string>; }
type RuntimeVariableMap = Map<string, string>;
export async function readRuntimeShellCommandHints(input: ReadRuntimeShellCommandHintsInput): Promise<RuntimeShellCommandHints> {
  const usesPowerShell = usesRuntimePowerShellSyntax(input.backendKind), allowsAndAnd = usesPowerShell && supportsWindowsPowerShellAndAnd(), scan = readCommandScan(input.command, usesPowerShell);
  const absolutePaths = uniquePreview(scan.tokens.flatMap((token) => readAbsolutePathCandidates(token, input.backendKind)));
  const externalAbsolutePaths = uniquePreview(absolutePaths.filter((token) => isExternalAbsolutePath(token, input.visibleRoot)));
  const externalWritePaths = uniquePreview(scan.writeTokens.map((token) => normalizeAbsolutePath(token, input.backendKind)).filter((token): token is string => Boolean(token)).filter((token) => isExternalAbsolutePath(token, input.visibleRoot)));
  const fileCommands = uniquePreview(scan.segments.map((segment) => segment.command).filter((command) => FILE_COMMANDS.has(command)));
  const networkCommands = uniquePreview(scan.segments.flatMap((segment) => readNetworkCommands(segment.command, segment.args)));
  const parentTraversalPaths = uniquePreview(scan.tokens.filter(isParentTraversalToken)), usesCd = scan.segments.some((segment) => CD_COMMANDS.has(segment.command));
  const metadata: RuntimeShellCommandHintMetadata = {
    ...(absolutePaths.length > 0 ? { absolutePaths } : {}), ...(externalAbsolutePaths.length > 0 ? { externalAbsolutePaths } : {}), ...(externalWritePaths.length > 0 ? { externalWritePaths } : {}), ...(fileCommands.length > 0 ? { fileCommands } : {}), ...(networkCommands.length > 0 ? { networkCommands } : {}), ...(parentTraversalPaths.length > 0 ? { parentTraversalPaths } : {}),
    ...(usesCd ? { usesCd: true } : {}), ...(networkCommands.length > 0 ? { usesNetworkCommand: true } : {}), ...(parentTraversalPaths.length > 0 ? { usesParentTraversal: true } : {}), ...(input.workdir && usesCd ? { redundantCdWithWorkdir: true } : {}), ...(usesPowerShell && input.command.includes('&&') && !allowsAndAnd ? { usesWindowsAndAnd: true } : {}), ...(externalWritePaths.length > 0 ? { writesExternalPath: true } : {}), ...(networkCommands.length > 0 && externalAbsolutePaths.length > 0 ? { networkTouchesExternalPath: true } : {}),
  };
  const summary = [
    usesCd ? '含 cd' : undefined, input.workdir && usesCd ? '已提供 workdir，命令里仍含 cd' : undefined, parentTraversalPaths.length > 0 ? `相对上级路径: ${parentTraversalPaths.join(', ')}` : undefined,
    networkCommands.length > 0 ? `联网命令: ${networkCommands.join(', ')}` : undefined, networkCommands.length > 0 && externalAbsolutePaths.length > 0 ? `联网命令涉及外部绝对路径: ${externalAbsolutePaths.join(', ')}` : undefined,
    externalWritePaths.length > 0 ? `写入命令涉及外部绝对路径: ${externalWritePaths.join(', ')}` : undefined, usesPowerShell && input.command.includes('&&') && !allowsAndAnd ? '当前 Windows PowerShell 不支持 &&' : undefined,
    fileCommands.length > 0 ? `文件命令: ${fileCommands.join(', ')}` : undefined, externalAbsolutePaths.length > 0 ? `外部绝对路径: ${externalAbsolutePaths.join(', ')}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return { ...(Object.keys(metadata).length > 0 ? { metadata } : {}), ...(summary.length > 0 ? { summary: `静态提示: ${summary.join('、')}` } : {}) };
}
function readCommandScan(command: string, usesPowerShell: boolean): { segments: RuntimeShellSegment[]; tokens: string[]; writeTokens: string[] } {
  const variables = new Map<string, string>(), segments: RuntimeShellSegment[] = [], entries = tokenizeCommand(command);
  let current: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'separator' && !['(', ')'].includes(entry.text)) {
      if (current.length > 0) {
        const segment = usesPowerShell ? readPowerShellSegment(current, variables) : readBashSegment(current, variables);
        if (segment) { segments.push(segment); }
      }
      current = [];
      continue;
    }
    if (entry.kind === 'token') { current.push(entry.text); }
  }
  if (current.length > 0) {
    const segment = usesPowerShell ? readPowerShellSegment(current, variables) : readBashSegment(current, variables);
    if (segment) { segments.push(segment); }
  }
  const redirected = uniquePreview(readRedirectionTokens(command).map((token) => usesPowerShell ? expandPowerShellValue(token, variables) : expandBashValue(token, variables)).filter((token) => token.length > 0));
  return { segments, tokens: [...segments.flatMap((segment) => segment.tokens), ...redirected], writeTokens: [...segments.flatMap((segment) => readWriteTargets(segment.command, segment.args)), ...redirected] };
}
function tokenizeCommand(command: string): RuntimeShellEntry[] {
  const bracedValues: string[] = [], joinPathValues: string[] = [];
  const protectedCommand = command.replace(/\$\{[^}\r\n]+\}/gmu, (match) => `__GARLIC_CLAW_BRACED_${bracedValues.push(match) - 1}__`).replace(/\$\(\s*Join-Path\b(?:[^()"'\x60]|"[^"]*"|'[^']*'|`[^`]*`)+\)|\(\s*Join-Path\b(?:[^()"'\x60]|"[^"]*"|'[^']*'|`[^`]*`)+\)/gmu, (match) => `__GARLIC_CLAW_JOIN_PATH_${joinPathValues.push(match) - 1}__`);
  return (protectedCommand.match(/&&|\|\||[;|(){}]|"[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+/gmu) ?? []).map((token) => token.replace(/__GARLIC_CLAW_BRACED_(\d+)__/gu, (match, indexText) => bracedValues[Number(indexText)] ?? match).replace(/__GARLIC_CLAW_JOIN_PATH_(\d+)__/gu, (match, indexText) => joinPathValues[Number(indexText)] ?? match).trim()).filter((token) => token.length > 0).map((token) => SHELL_SEPARATORS.has(token) ? { kind: 'separator' as const, text: token } : { kind: 'token' as const, text: normalizeQuotedToken(token) }).filter((entry) => entry.kind === 'separator' || entry.text.length > 0);
}
function readBashSegment(tokens: string[], variables: RuntimeVariableMap): RuntimeShellSegment | undefined {
  const scoped = new Map(variables); let index = 0;
  while (index < tokens.length) {
    const assignment = tokens[index]?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!assignment) { break; }
    scoped.set(assignment[1], expandBashValue(assignment[2], scoped)); index += 1;
  }
  if (index >= tokens.length) { for (const [name, value] of scoped) { variables.set(name, value); } return undefined; }
  const commandIndex = readCommandStartIndex(tokens.slice(index), BASH_CONTROL_WORDS);
  if (commandIndex < 0) { return undefined; }
  const expanded = tokens.slice(index + commandIndex).map((token) => expandBashValue(token, scoped)), command = normalizeCommand(expanded[0] ?? '');
  return command ? { command, args: expanded.slice(1), tokens: expanded } : undefined;
}
function readPowerShellSegment(tokens: string[], variables: RuntimeVariableMap): RuntimeShellSegment | undefined {
  const compact = tokens[0]?.match(/^\$([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
  if (compact && tokens.length === 1) { variables.set(compact[1].toLowerCase(), readAssignedPowerShellValue(compact[2], variables)); return undefined; }
  if (tokens.length >= 3 && /^\$[A-Za-z_][A-Za-z0-9_]*$/u.test(tokens[0] ?? '') && tokens[1] === '=') { variables.set(tokens[0].slice(1).toLowerCase(), readAssignedPowerShellValue(tokens.slice(2).join(' '), variables)); return undefined; }
  const commandIndex = readCommandStartIndex(tokens, POWERSHELL_CONTROL_WORDS);
  if (commandIndex < 0) { return undefined; }
  const expanded = tokens.slice(commandIndex).map((token) => expandPowerShellValue(token, variables)), command = normalizeCommand(expanded[0] ?? '');
  return command ? { command, args: expanded.slice(1), tokens: expanded } : undefined;
}
function readCommandStartIndex(tokens: string[], ignored: Set<string>): number {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = normalizeCommand(tokens[index] ?? '');
    if (token && !ignored.has(token) && token !== '=' && token !== '{' && token !== '}') { return index; }
  }
  return -1;
}
function readRedirectionTokens(command: string): string[] {
  return uniquePreview(Array.from(command.matchAll(/(?:^|[\s;|(){}])(?:\d*>>?|\*>)\s*("[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+)/gmu), (match) => normalizeQuotedToken(match[1]?.trim() ?? '')).filter((token) => token.length > 0));
}
function readAbsolutePathCandidates(token: string, backendKind: RuntimeBackendKind): string[] {
  const normalized = normalizeAbsolutePath(token, backendKind), attachedValue = readPowerShellFlagValueMatch(token, FLAG_SETS.path)?.attachedValue;
  return normalized ? [normalized] : attachedValue ? [normalizeAbsolutePath(normalizeQuotedToken(attachedValue), backendKind)].filter((value): value is string => Boolean(value)) : [];
}
function normalizeAbsolutePath(token: string, backendKind: RuntimeBackendKind): string | undefined {
  const singleQuoted = token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX), providerPrefix = token.match(/^filesystem::/iu)?.[0] ?? '', candidate = providerPrefix ? token.slice(providerPrefix.length) : unwrapInspectionToken(token);
  if (isAbsolutePath(candidate, backendKind)) { return `${providerPrefix}${candidate}`; }
  if (!singleQuoted) {
    const envPath = expandEnvPath(candidate, POWERSHELL_ENV_PATTERNS) ?? expandEnvPath(candidate, POSIX_ENV_PATTERNS);
    if (envPath && isAbsolutePath(envPath, backendKind)) { return `${providerPrefix}${envPath}`; }
  }
  const joinPath = readJoinPathValue(candidate, new Map());
  return joinPath && isAbsolutePath(joinPath, backendKind) ? `${providerPrefix}${joinPath}` : undefined;
}
function isAbsolutePath(token: string, backendKind: RuntimeBackendKind): boolean {
  const candidate = unwrapInspectionToken(token);
  if (candidate !== token) { return isAbsolutePath(candidate, backendKind); }
  if (!token || token.startsWith('-') || /^(https?|git|ssh|ftp):\/\//iu.test(token) || (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(token) && !/^[A-Za-z]:[\\/]/u.test(token))) { return false; }
  return token === '~' || token.startsWith('~/') || token.startsWith('~\\') || token.startsWith('/') || (backendKind === 'native-shell' && /^~[\\/]/u.test(token)) || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(token) || /^filesystem::/iu.test(token);
}
function isExternalAbsolutePath(token: string, visibleRoot: string): boolean {
  const candidate = unwrapInspectionToken(token);
  if (candidate !== token) { return isExternalAbsolutePath(candidate, visibleRoot); }
  if (token === '~' || token.startsWith('~/') || token.startsWith('~\\') || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(token)) { return true; }
  if (!token.startsWith('/')) { return false; }
  const normalized = normalizeRuntimeVisiblePath(token);
  return visibleRoot === '/' ? false : normalized !== visibleRoot && !normalized.startsWith(`${visibleRoot}/`);
}
function isParentTraversalToken(token: string): boolean {
  const candidate = unwrapInspectionToken(token);
  return candidate !== token ? isParentTraversalToken(candidate) : Boolean(token) && !token.startsWith('-') && /^\.\.([\\/]|$)/u.test(token);
}

function readNetworkCommands(command: string, args: string[]): string[] {
  const subcommand = normalizeCommand(args[0] ?? '');
  if (NETWORK_COMMANDS.has(command)) { return [command]; }
  if (command === 'git' && GIT_NETWORK_SUBCOMMANDS.has(subcommand)) { return [`git ${subcommand}`]; }
  return PACKAGE_MANAGER_COMMANDS.has(command) && PACKAGE_MANAGER_NETWORK_SUBCOMMANDS.has(subcommand) ? [`${command} ${subcommand}`] : [];
}
function readWriteTargets(command: string, args: string[]): string[] {
  const targets = readSpecialWriteTargets(command, args);
  return targets ?? (WRITE_COMMANDS.has(command) ? readDefaultWriteTargets(command, args) : []);
}
function readSpecialWriteTargets(command: string, args: string[]): string[] | null {
  if (command === 'cp' || command === 'mv') { return readCopyMoveTargets(args); }
  if (command === 'curl') { return readShellFlagValues(args, FLAG_SETS.curlWrite); }
  if (command === 'wget') { return readShellFlagValues(args, FLAG_SETS.wgetWrite); }
  if (command === 'git') { return readGitTargets(args); }
  if (command === 'tar') { return readTarTargets(args); }
  if (command === 'scp') { return readDestinationTargets(args, 2); }
  if (command === 'mkdir') { return args.some((token) => FLAG_SETS.newItem.has(token.toLowerCase())) ? readPowerShellTargets(args, { fallback: 'path', positionalValueFlags: FLAG_SETS.newItem, leafFlags: FLAG_SETS.name, pathFlags: FLAG_SETS.basePath, buildPath: joinPath }) : null; }
  const rules: Partial<Record<string, RuntimePowerShellTargetRule>> = {
    'add-content': { fallback: 'path', positionalValueFlags: FLAG_SETS.content }, 'copy-item': { fallback: 'destination', positionalValueFlags: FLAG_SETS.destination, pathFlags: FLAG_SETS.destination },
    'move-item': { fallback: 'destination', positionalValueFlags: FLAG_SETS.destination, pathFlags: FLAG_SETS.destination }, 'new-item': { fallback: 'path', positionalValueFlags: FLAG_SETS.newItem, leafFlags: FLAG_SETS.name, pathFlags: FLAG_SETS.basePath, buildPath: joinPath },
    'out-file': { fallback: 'path', positionalValueFlags: FLAG_SETS.outFile }, 'remove-item': { fallback: 'path', positionalValueFlags: FLAG_SETS.removeItem, pathFlags: FLAG_SETS.basePath },
    'rename-item': { fallback: 'path', positionalValueFlags: FLAG_SETS.renameItem, leafFlags: FLAG_SETS.newName, pathFlags: FLAG_SETS.basePath, buildPath: resolveRenamePath }, 'set-content': { fallback: 'path', positionalValueFlags: FLAG_SETS.content },
  };
  const rule = rules[command];
  return rule ? readPowerShellTargets(args, rule) : null;
}
function readDefaultWriteTargets(command: string, args: string[]): string[] {
  const flagged = command.includes('-') ? readPowerShellOptionValues(args, FLAG_SETS.path, normalizeQuotedToken) : [];
  return flagged.length > 0 ? flagged : args.filter((token) => !token.startsWith('-') && !(command === 'chmod' && token.startsWith('+')));
}
function readCopyMoveTargets(args: string[]): string[] {
  const destination = readShellFlagValues(args, FLAG_SETS.copyMoveDestination);
  return destination.length > 0 ? destination : readDestinationTargets(args, 2);
}

function readGitTargets(args: string[]): string[] {
  const subcommand = normalizeCommand(args[0] ?? ''), nested = normalizeCommand(args[1] ?? '');
  if (subcommand === 'archive') { return readShellFlagValues(args.slice(1), FLAG_SETS.gitArchiveWrite); }
  if (subcommand === 'bundle' && nested === 'create') { return readFlagAwarePositionalValues(args.slice(2), new Set<string>()).slice(0, 1); }
  if (subcommand === 'clone') {
    const extra = readShellFlagValues(args.slice(1), FLAG_SETS.gitCloneWrite), positional = args.slice(1).filter((token) => !token.startsWith('-'));
    return positional.length < 2 ? extra : uniquePreview([...extra, positional[positional.length - 1]]);
  }
  if (subcommand === 'format-patch') { return readShellFlagValues(args.slice(1), FLAG_SETS.gitFormatPatchWrite); }
  if (subcommand === 'init') {
    const positional = readFlagAwarePositionalValues(args.slice(1), FLAG_SETS.gitInitValue);
    return uniquePreview([...readShellFlagValues(args.slice(1), FLAG_SETS.gitCloneWrite), ...(positional[0] ? [positional[0]] : [])]);
  }
  if (subcommand === 'submodule' && nested === 'add') {
    const positional = readFlagAwarePositionalValues(args.slice(2), FLAG_SETS.gitSubmoduleAddValue);
    return positional.length >= 2 ? [positional[positional.length - 1]] : [];
  }
  return subcommand === 'worktree' && nested === 'add' ? readFlagAwarePositionalValues(args.slice(2), FLAG_SETS.gitWorktreeAddValue).slice(0, 1) : [];
}
function readTarTargets(args: string[]): string[] {
  const targets: string[] = [];
  if (hasTarMode(args, FLAG_SETS.tarCreate, SHORT_TAR_CREATE_FLAGS)) { targets.push(...readTarFlagValues(args, 'f', FLAG_SETS.tarFile)); }
  if (hasTarMode(args, FLAG_SETS.tarExtract, SHORT_TAR_EXTRACT_FLAGS)) { targets.push(...readTarFlagValues(args, 'C', FLAG_SETS.tarDirectory)); }
  return uniquePreview(targets);
}
function readPowerShellTargets(args: string[], rule: RuntimePowerShellTargetRule): string[] {
  const pathFlags = rule.pathFlags ?? FLAG_SETS.path, positional = readPowerShellPositionalValues(args, rule.positionalValueFlags);
  let pathValue = readPowerShellOptionValues(args, pathFlags, normalizeQuotedToken)[0];
  if (!pathValue) {
    for (let index = 0; index < args.length - 1; index += 1) {
      const token = args[index] ?? '', matched = matchPowerShellFlag(token, pathFlags);
      if (!matched || token.toLowerCase() !== matched) { continue; }
      const next = args[index + 1] ?? '';
      if (normalizeCommand(next) === 'join-path') { pathValue = `(${args.slice(index + 1).join(' ')})`; break; }
      if (/^\$?\(\s*Join-Path\b/iu.test(next)) { pathValue = next; break; }
    }
  }
  if (!rule.leafFlags || !rule.buildPath) {
    if (pathValue) { return [pathValue]; }
    if (rule.fallback === 'destination') { return readDestinationTargets(args, 2); }
    const first = positional[0] ?? '';
    return normalizeCommand(first) === 'join-path' ? [`(${positional.join(' ')})`] : first ? [first] : [];
  }
  const leafName = readPowerShellOptionValues(args, rule.leafFlags, normalizeQuotedToken)[0] ?? positional[1], basePath = pathValue ?? positional[0];
  return basePath && leafName ? [rule.buildPath(basePath, leafName)] : basePath ? [basePath] : [];
}
function hasTarMode(args: string[], longFlags: Set<string>, shortFlags: readonly string[]): boolean {
  return args.some((token) => longFlags.has(token) || shortFlags.some((flag) => token.startsWith('-') && !token.startsWith('--') && token.slice(1).includes(flag)));
}

function readTarFlagValues(args: string[], shortFlag: string, longFlags: Set<string>): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? '';
    if (token.startsWith('--')) {
      const matched = [...longFlags].find((flag) => token === flag || token.startsWith(`${flag}=`));
      if (!matched) { continue; }
      if (token.startsWith(`${matched}=`)) { values.push(token.slice(matched.length + 1)); continue; }
      const next = args[index + 1];
      if (next && !next.startsWith('-')) { values.push(next); index += 1; }
      continue;
    }
    if (!token.startsWith('-') || token.startsWith('--') || !token.slice(1).includes(shortFlag)) { continue; }
    const attached = token.slice(token.indexOf(shortFlag) + 1);
    if (attached.length > 0) { values.push(attached); continue; }
    const next = args[index + 1];
    if (next && !next.startsWith('-')) { values.push(next); index += 1; }
  }
  return values;
}
function readPowerShellOptionValues(args: string[], flags: Iterable<string>, normalizeValue?: (value: string) => string): string[] { return readOptionValues(args, (token) => readPowerShellFlagValueMatch(token, flags), normalizeValue); }
function readShellFlagValues(args: string[], flags: Set<string>): string[] { return readOptionValues(args, (token) => readShellFlagValueMatch(token, flags)); }
function readOptionValues(args: string[], matchValue: (token: string) => RuntimeOptionValueMatch | undefined, normalizeValue?: (value: string) => string): string[] {
  const values: string[] = []; let wantsValue = false;
  for (const token of args) {
    if (wantsValue) {
      if (!token.startsWith('-')) { values.push(normalizeValue ? normalizeValue(token) : token); }
      wantsValue = false;
      continue;
    }
    const matched = matchValue(token);
    if (!matched) { continue; }
    if (matched.attachedValue !== undefined) { values.push(normalizeValue ? normalizeValue(matched.attachedValue) : matched.attachedValue); continue; }
    wantsValue = matched.takesNextValue;
  }
  return values;
}
function readDestinationTargets(args: string[], minPositionalCount = 1): string[] {
  const positional = args.filter((token) => !token.startsWith('-'));
  return positional.length >= minPositionalCount ? [positional[positional.length - 1]] : [];
}

function readPowerShellPositionalValues(args: string[], valueFlags: Iterable<string>): string[] {
  const flags = [...valueFlags], positional: string[] = [];
  let skipNextValue = false;
  for (const token of args) {
    const normalized = token.toLowerCase();
    if (skipNextValue) { skipNextValue = false; continue; }
    if (flags.includes(normalized)) { skipNextValue = true; continue; }
    if (flags.some((flag) => normalized.startsWith(`${flag}:`)) || token.startsWith('-')) { continue; }
    positional.push(token);
  }
  return positional;
}

function readFlagAwarePositionalValues(args: string[], valueFlags: Set<string>): string[] {
  const positional: string[] = [];
  let skipNextValue = false;
  for (const token of args) {
    if (skipNextValue) { skipNextValue = false; continue; }
    if (token.startsWith('-')) { skipNextValue = valueFlags.has(token.toLowerCase()); continue; }
    positional.push(token);
  }
  return positional;
}

function readShellFlagValueMatch(token: string, flags: Set<string>): RuntimeOptionValueMatch | undefined {
  const matched = [...flags].find((flag) => token === flag || token.startsWith(`${flag}=`) || (flag.startsWith('-') && !flag.startsWith('--') && token.startsWith(flag) && token.length > flag.length));
  if (!matched) { return undefined; }
  if (token.startsWith(`${matched}=`)) { return { attachedValue: token.slice(matched.length + 1), takesNextValue: false }; }
  if (matched.startsWith('-') && !matched.startsWith('--') && token.length > matched.length) { return { attachedValue: token.slice(matched.length), takesNextValue: false }; }
  return { takesNextValue: true };
}

function readPowerShellFlagValueMatch(token: string, flags: Iterable<string>): RuntimeOptionValueMatch | undefined {
  const matched = matchPowerShellFlag(token, flags);
  return !matched ? undefined : token.toLowerCase().startsWith(`${matched}:`) ? { attachedValue: token.slice(matched.length + 1).trim(), takesNextValue: false } : { takesNextValue: token.toLowerCase() === matched };
}
function matchPowerShellFlag(token: string, flags: Iterable<string>): string | undefined {
  const normalized = token.toLowerCase();
  return [...flags].find((flag) => normalized === flag || normalized.startsWith(`${flag}:`));
}

function normalizeQuotedToken(token: string): string {
  if (token.length >= 2 && token.startsWith('\'') && token.endsWith('\'')) { return `${SINGLE_QUOTED_LITERAL_PREFIX}${token.slice(1, -1).trim()}`; }
  const first = token[0], last = token[token.length - 1];
  return token.length >= 2 && (first === '"' || first === '\'' || first === '`') && first === last ? token.slice(1, -1).trim() : token;
}

function expandBashValue(token: string, variables: RuntimeVariableMap): string {
  if (token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX)) { return token; }
  return token.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (match, bracedName, simpleName) => variables.get(bracedName || simpleName) ?? readProcessEnvValue(bracedName || simpleName) ?? match);
}

function expandPowerShellValue(token: string, variables: RuntimeVariableMap): string {
  if (token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX)) { return token; }
  const providerPrefix = token.match(/^filesystem::/iu)?.[0] ?? '', candidate = providerPrefix ? token.slice(providerPrefix.length) : token, joinPath = readJoinPathValue(candidate, variables);
  if (joinPath) { return `${providerPrefix}${joinPath}`; }
  const value = candidate.replace(/\$\((\$\{env:[^}]+\}|\$env:[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)\)/gu, (match, reference) => readPowerShellReferenceValue(reference, variables) ?? match).replace(/\$\{env:([^}]+)\}|\$env:([A-Za-z_][A-Za-z0-9_]*)/giu, (match, bracedName, simpleName) => readProcessEnvValue(bracedName || simpleName) ?? match).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (match, bracedName, simpleName) => variables.get((bracedName || simpleName).toLowerCase()) ?? match);
  return `${providerPrefix}${value}`;
}

function readAssignedPowerShellValue(token: string, variables: RuntimeVariableMap): string { return unwrapSingleQuotedLiteral(expandPowerShellValue(normalizeQuotedToken(token.trim()), variables)); }
function readPowerShellReferenceValue(value: string, variables: RuntimeVariableMap): string | undefined {
  const envMatch = value.match(/^\$\{env:([^}]+)\}$|^\$env:([A-Za-z_][A-Za-z0-9_]*)$/iu), localMatch = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$|^\$([A-Za-z_][A-Za-z0-9_]*)$/u);
  return envMatch ? readProcessEnvValue(envMatch[1] || envMatch[2]) : localMatch ? variables.get((localMatch[1] || localMatch[2]).toLowerCase()) : undefined;
}

function readJoinPathValue(token: string, variables: RuntimeVariableMap): string | undefined {
  const trimmed = token.trim(), body = trimmed.startsWith('$(') && trimmed.endsWith(')') ? trimmed.slice(2, -1).trim() : trimmed.startsWith('(') && trimmed.endsWith(')') ? trimmed.slice(1, -1).trim() : trimmed.toLowerCase().startsWith('join-path ') ? trimmed : undefined;
  if (!body) { return undefined; }
  const entries = tokenizeCommand(body).filter((entry) => entry.kind === 'token').map((entry) => entry.text);
  if (normalizeCommand(entries[0] ?? '') !== 'join-path') { return undefined; }
  const args = entries.slice(1), positional = readPowerShellPositionalValues(args, FLAG_SETS.joinPath);
  const basePath = expandPowerShellValue(readPowerShellOptionValues(args, FLAG_SETS.joinPathPath, normalizeQuotedToken)[0] ?? positional[0] ?? '', variables);
  if (!basePath || !isAbsolutePathLike(basePath)) { return undefined; }
  const childValues = (readPowerShellOptionValues(args, FLAG_SETS.joinPathChild, normalizeQuotedToken).length > 0 ? readPowerShellOptionValues(args, FLAG_SETS.joinPathChild, normalizeQuotedToken) : positional.slice(1)).map((child) => unwrapSingleQuotedLiteral(expandPowerShellValue(child, variables))).filter((child) => child.length > 0);
  return childValues.reduce(joinPath, basePath);
}

function resolveRenamePath(basePath: string, newName: string): string {
  if (isAbsolutePathLike(newName)) { return newName; }
  if (/^filesystem::/iu.test(basePath)) { return joinPath(basePath.match(/^(filesystem::.*?)[\\/][^\\/]+$/u)?.[1] ?? basePath, newName); }
  const normalized = basePath.replace(/[\\/]+$/u, '');
  if (/^[A-Za-z]:[\\/][^\\/]+$/u.test(normalized)) { return joinPath(normalized.slice(0, 3), newName); }
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return joinPath(separatorIndex <= 0 ? (normalized.startsWith('/') ? '/' : normalized) : normalized.slice(0, separatorIndex), newName);
}

function joinPath(basePath: string, leafName: string): string {
  if (isAbsolutePathLike(leafName)) { return leafName; }
  const trimmedBase = basePath.replace(/[\\/]+$/u, ''), trimmedLeaf = leafName.replace(/^[\\/]+/u, '');
  return /^filesystem::/iu.test(trimmedBase) || /^[A-Za-z]:$/u.test(trimmedBase) || /^[A-Za-z]:[\\/]/u.test(trimmedBase) || trimmedBase.includes('\\') ? `${trimmedBase}\\${trimmedLeaf}` : `${trimmedBase}/${trimmedLeaf}`;
}

function isAbsolutePathLike(value: string): boolean { return value === '~' || value.startsWith('~/') || value.startsWith('~\\') || value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(value) || /^filesystem::/iu.test(value); }
function normalizeCommand(token: string): string {
  const normalized = token.toLowerCase();
  return COMMAND_ALIASES.get(normalized) ?? normalized;
}
function unwrapInspectionToken(token: string): string { return token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX) ? token.slice(SINGLE_QUOTED_LITERAL_PREFIX.length) : token.match(/^filesystem::(.+)$/iu)?.[1] ?? token; }
function unwrapSingleQuotedLiteral(token: string): string { return token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX) ? token.slice(SINGLE_QUOTED_LITERAL_PREFIX.length) : token; }

function expandEnvPath(token: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = token.match(pattern), value = match ? readProcessEnvValue(match[1]) : undefined;
    if (match && value) { return `${value}${match[2]}`; }
  }
  return undefined;
}

function readProcessEnvValue(key: string): string | undefined {
  if (process.platform !== 'win32') { return process.env[key]; }
  const matchedKey = Object.keys(process.env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return matchedKey ? process.env[matchedKey] : undefined;
}

function uniquePreview(values: string[]): string[] { return [...new Set(values)].slice(0, MAX_PREVIEW_ITEMS); }
export function usesRuntimePowerShellSyntax(backendKind: RuntimeBackendKind): boolean { return process.platform === 'win32' && backendKind.includes('native-shell') && !backendKind.includes('wsl'); }
