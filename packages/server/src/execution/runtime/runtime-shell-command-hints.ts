import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { normalizeRuntimeVisiblePath } from './runtime-visible-path';

const FILE_COMMANDS = new Set(['cd', 'pushd', 'popd', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown', 'tar', 'get-content', 'out-file', 'set-content', 'add-content', 'copy-item', 'move-item', 'remove-item', 'new-item', 'rename-item', 'set-location', 'push-location']);
const CD_COMMANDS = new Set(['cd', 'pushd', 'popd', 'set-location', 'push-location']);
const WRITE_COMMANDS = new Set(['cp', 'mv', 'rm', 'mkdir', 'touch', 'chmod', 'chown', 'tar', 'out-file', 'set-content', 'add-content', 'copy-item', 'invoke-webrequest', 'move-item', 'remove-item', 'new-item', 'rename-item']);
const NETWORK_COMMANDS = new Set(['curl', 'wget', 'fetch', 'nc', 'telnet', 'ssh', 'scp', 'sftp', 'invoke-webrequest', 'invoke-restmethod']);
const COMMAND_ALIASES = new Map<string, string>([['gc', 'get-content'], ['irm', 'invoke-restmethod'], ['iwr', 'invoke-webrequest'], ['copy', 'copy-item'], ['move', 'move-item'], ['sc', 'set-content'], ['ac', 'add-content'], ['sl', 'set-location'], ['cpi', 'copy-item'], ['mi', 'move-item'], ['ni', 'new-item'], ['md', 'mkdir'], ['rd', 'remove-item'], ['ri', 'remove-item'], ['del', 'remove-item'], ['erase', 'remove-item'], ['ren', 'rename-item']]);
const GIT_NETWORK_SUBCOMMANDS = new Set(['clone', 'fetch', 'pull']);
const PACKAGE_MANAGER_COMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PACKAGE_MANAGER_NETWORK_SUBCOMMANDS = new Set(['install', 'add']);
const POWERSHELL_PATH_FLAGS = new Set(['-path', '-filepath', '-literalpath', '-destination', '-outfile', '-outputfile']);
const POWERSHELL_DESTINATION_FLAGS = new Set(['-destination']);
const POWERSHELL_JOIN_PATH_FLAGS = new Set(['-path', '-childpath', '-additionalchildpath']);
const POWERSHELL_JOIN_PATH_PATH_FLAGS = new Set(['-path']);
const POWERSHELL_JOIN_PATH_CHILD_FLAGS = new Set(['-childpath', '-additionalchildpath']);
const POWERSHELL_NAME_FLAGS = new Set(['-name']);
const POWERSHELL_NEW_NAME_FLAGS = new Set(['-newname']);
const POWERSHELL_CONTENT_FLAGS = new Set(['-value', '-encoding', '-delimiter', '-stream']);
const POWERSHELL_OUT_FILE_FLAGS = new Set(['-filepath', '-literalpath', '-inputobject', '-encoding', '-width']);
const POWERSHELL_NEW_ITEM_FLAGS = new Set(['-path', '-literalpath', '-name', '-itemtype', '-value']);
const POWERSHELL_RENAME_ITEM_FLAGS = new Set(['-path', '-literalpath', '-newname']);
const POWERSHELL_REMOVE_ITEM_VALUE_FLAGS = new Set(['-path', '-literalpath', '-include', '-exclude', '-filter', '-stream']);
const POWERSHELL_REMOVE_ITEM_PATH_FLAGS = new Set(['-path', '-literalpath']);
const CURL_WRITE_FLAGS = new Set(['-o', '--output']);
const WGET_WRITE_FLAGS = new Set(['-O', '--output-document', '--output-file', '-P', '--directory-prefix']);
const CP_MV_DESTINATION_FLAGS = new Set(['-t', '--target-directory']);
const GIT_ARCHIVE_WRITE_FLAGS = new Set(['-o', '--output']);
const GIT_CLONE_WRITE_FLAGS = new Set(['--separate-git-dir']);
const GIT_FORMAT_PATCH_WRITE_FLAGS = new Set(['-o', '--output-directory']);
const GIT_INIT_VALUE_FLAGS = new Set(['-b', '-c', '--initial-branch', '--object-format', '--ref-format', '--template']);
const GIT_SUBMODULE_ADD_VALUE_FLAGS = new Set(['-b', '--branch', '--depth', '--name', '--reference']);
const GIT_WORKTREE_ADD_VALUE_FLAGS = new Set(['-b', '-B', '--orphan', '--reason']);
const TAR_CREATE_FLAGS = new Set(['--append', '--catenate', '--concatenate', '--create', '--update']);
const TAR_EXTRACT_FLAGS = new Set(['--extract', '--get']);
const TAR_FILE_FLAGS = new Set(['--file']);
const TAR_DIRECTORY_FLAGS = new Set(['--directory']);
const BASH_CONTROL_WORDS = new Set(['do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'select', 'then', 'until', 'while']);
const POWERSHELL_CONTROL_WORDS = new Set(['begin', 'catch', 'do', 'else', 'elseif', 'end', 'filter', 'finally', 'for', 'foreach', 'function', 'if', 'in', 'param', 'process', 'switch', 'trap', 'try', 'until', 'while']);
const POWERSHELL_ENV_PATTERNS = [/^\$env:([A-Za-z_][A-Za-z0-9_]*)(.*)$/iu, /^\$\{env:([^}]+)\}(.*)$/iu] as const;
const POSIX_ENV_PATTERNS = [/^\$([A-Za-z_][A-Za-z0-9_]*)(.*)$/u, /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}(.*)$/u] as const;
const SHORT_TAR_CREATE_FLAGS = ['c', 'r', 'u'] as const;
const SHORT_TAR_EXTRACT_FLAGS = ['x'] as const;
const SHELL_SEPARATORS = new Set(['&&', '||', ';', '|', '(', ')', '{', '}']);
const SINGLE_QUOTED_LITERAL_PREFIX = '__GARLIC_CLAW_SINGLE_QUOTED__';
const MAX_PREVIEW_ITEMS = 3;

export interface RuntimeShellCommandHintMetadata {
  absolutePaths?: string[]; externalAbsolutePaths?: string[]; externalWritePaths?: string[]; fileCommands?: string[]; networkCommands?: string[]; parentTraversalPaths?: string[];
  networkTouchesExternalPath?: boolean; redundantCdWithWorkdir?: boolean; usesCd?: boolean; usesNetworkCommand?: boolean; usesParentTraversal?: boolean; usesWindowsAndAnd?: boolean; writesExternalPath?: boolean;
}
export interface RuntimeShellCommandHints { metadata?: RuntimeShellCommandHintMetadata; summary?: string; }
interface ReadRuntimeShellCommandHintsInput { backendKind: RuntimeBackendKind; command: string; visibleRoot: string; workdir?: string; }
interface RuntimeShellEntry { kind: 'separator' | 'token'; text: string; } interface RuntimeShellSegment { command: string; args: string[]; tokens: string[]; }
type RuntimeShellVariableMap = Map<string, string>; type RuntimeShellWriteRule = (args: string[]) => string[];

export async function readRuntimeShellCommandHints(input: ReadRuntimeShellCommandHintsInput): Promise<RuntimeShellCommandHints> {
  const usesPowerShell = usesRuntimePowerShellSyntax(input.backendKind);
  const scan = scanRuntimeShellCommand(input.command, usesPowerShell);
  const absolutePaths = uniquePreview(scan.tokens.flatMap((token) => readRuntimeShellAbsolutePathCandidates(token, input.backendKind))), externalAbsolutePaths = uniquePreview(absolutePaths.filter((token) => isRuntimeExternalAbsolutePath(token, input.visibleRoot))), externalWritePaths = uniquePreview(scan.writeTokens.map((token) => normalizeRuntimeShellAbsolutePath(token, input.backendKind)).filter((token): token is string => Boolean(token)).filter((token) => isRuntimeExternalAbsolutePath(token, input.visibleRoot)));
  const fileCommands = uniquePreview(scan.segments.map((segment) => segment.command).filter((command) => FILE_COMMANDS.has(command)));
  const networkCommands = uniquePreview(scan.segments.flatMap((segment) => readRuntimeShellNetworkCommands(segment.command, segment.args))), parentTraversalPaths = uniquePreview(scan.tokens.filter(isRuntimeParentTraversalToken)), usesCd = scan.segments.some((segment) => CD_COMMANDS.has(segment.command));
  const metadata: RuntimeShellCommandHintMetadata = { ...(absolutePaths.length > 0 ? { absolutePaths } : {}), ...(externalAbsolutePaths.length > 0 ? { externalAbsolutePaths } : {}), ...(externalWritePaths.length > 0 ? { externalWritePaths } : {}), ...(fileCommands.length > 0 ? { fileCommands } : {}), ...(networkCommands.length > 0 ? { networkCommands } : {}), ...(parentTraversalPaths.length > 0 ? { parentTraversalPaths } : {}), ...(usesCd ? { usesCd: true } : {}), ...(networkCommands.length > 0 ? { usesNetworkCommand: true } : {}), ...(parentTraversalPaths.length > 0 ? { usesParentTraversal: true } : {}), ...(input.workdir && usesCd ? { redundantCdWithWorkdir: true } : {}), ...(usesPowerShell && input.command.includes('&&') ? { usesWindowsAndAnd: true } : {}), ...(externalWritePaths.length > 0 ? { writesExternalPath: true } : {}), ...(networkCommands.length > 0 && externalAbsolutePaths.length > 0 ? { networkTouchesExternalPath: true } : {}) };
  const summary = [usesCd ? '含 cd' : undefined, input.workdir && usesCd ? '已提供 workdir，命令里仍含 cd' : undefined, parentTraversalPaths.length > 0 ? `相对上级路径: ${parentTraversalPaths.join(', ')}` : undefined, networkCommands.length > 0 ? `联网命令: ${networkCommands.join(', ')}` : undefined, networkCommands.length > 0 && externalAbsolutePaths.length > 0 ? `联网命令涉及外部绝对路径: ${externalAbsolutePaths.join(', ')}` : undefined, externalWritePaths.length > 0 ? `写入命令涉及外部绝对路径: ${externalWritePaths.join(', ')}` : undefined, usesPowerShell && input.command.includes('&&') ? 'Windows native-shell 中不建议使用 &&' : undefined, fileCommands.length > 0 ? `文件命令: ${fileCommands.join(', ')}` : undefined, externalAbsolutePaths.length > 0 ? `外部绝对路径: ${externalAbsolutePaths.join(', ')}` : undefined].filter((part): part is string => Boolean(part));
  return { ...(Object.keys(metadata).length > 0 ? { metadata } : {}), ...(summary.length > 0 ? { summary: `静态提示: ${summary.join('、')}` } : {}) };
}

function scanRuntimeShellCommand(command: string, usesPowerShell: boolean): { segments: RuntimeShellSegment[]; tokens: string[]; writeTokens: string[]; } {
  const variables = new Map<string, string>(), segments: RuntimeShellSegment[] = [], entries = tokenizeRuntimeShellCommand(command);
  let current: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'separator' && !['(', ')'].includes(entry.text)) {
      if (current.length > 0) {
        const segment = usesPowerShell ? readRuntimePowerShellSegment(current, variables) : readRuntimeBashSegment(current, variables);
        if (segment) {segments.push(segment);}
      }
      current = []; continue;
    }
    if (entry.kind === 'token') {current.push(entry.text);}
  }
  if (current.length > 0) {
    const segment = usesPowerShell ? readRuntimePowerShellSegment(current, variables) : readRuntimeBashSegment(current, variables);
    if (segment) {segments.push(segment);}
  }
  const redirectionTokens = uniquePreview(readRuntimeShellRedirectionTokens(command).map((token) => expandRuntimeShellToken(token, variables, usesPowerShell)).filter((token) => token.length > 0));
  return { segments, tokens: [...segments.flatMap((segment) => segment.tokens), ...redirectionTokens], writeTokens: [...segments.flatMap((segment) => readRuntimeShellWriteTokens(segment.command, segment.args)), ...redirectionTokens] };
}

function readRuntimeBashSegment(rawTokens: string[], variables: RuntimeShellVariableMap): RuntimeShellSegment | undefined {
  const scoped = new Map(variables); let index = 0;
  while (index < rawTokens.length) {
    const assignment = rawTokens[index]?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!assignment) {break;}
    scoped.set(assignment[1], expandRuntimeBashValue(assignment[2], scoped)); index += 1;
  }
  if (index >= rawTokens.length) { for (const [name, value] of scoped) {variables.set(name, value);} return undefined; }
  const tokens = rawTokens.slice(index), commandIndex = readRuntimeCommandStartIndex(tokens, BASH_CONTROL_WORDS);
  if (commandIndex < 0) {return undefined;}
  const expanded = tokens.slice(commandIndex).map((token) => expandRuntimeBashValue(token, scoped)), command = normalizeRuntimeShellCommand(expanded[0] ?? '');
  return command ? { command, args: expanded.slice(1), tokens: expanded } : undefined;
}

function readRuntimePowerShellSegment(rawTokens: string[], variables: RuntimeShellVariableMap): RuntimeShellSegment | undefined {
  const compact = rawTokens[0]?.match(/^\$([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
  if (compact && rawTokens.length === 1) { variables.set(compact[1].toLowerCase(), readRuntimePowerShellAssignedValue(compact[2], variables)); return undefined; }
  if (rawTokens.length >= 3 && /^\$[A-Za-z_][A-Za-z0-9_]*$/u.test(rawTokens[0] ?? '') && rawTokens[1] === '=') { variables.set(rawTokens[0].slice(1).toLowerCase(), readRuntimePowerShellAssignedValue(rawTokens.slice(2).join(' '), variables)); return undefined; }
  const commandIndex = readRuntimeCommandStartIndex(rawTokens, POWERSHELL_CONTROL_WORDS);
  if (commandIndex < 0) {return undefined;}
  const expanded = rawTokens.slice(commandIndex).map((token) => expandRuntimePowerShellValue(token, variables)), command = normalizeRuntimeShellCommand(expanded[0] ?? '');
  return command ? { command, args: expanded.slice(1), tokens: expanded } : undefined;
}

function readRuntimeCommandStartIndex(tokens: string[], ignored: Set<string>): number {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = normalizeRuntimeShellCommand(tokens[index] ?? '');
    if (token && !ignored.has(token) && token !== '=' && token !== '{' && token !== '}') {return index;}
  }
  return -1;
}

function tokenizeRuntimeShellCommand(command: string): RuntimeShellEntry[] {
  const bracedValues: string[] = [], joinPaths: string[] = [];
  const protectedCommand = command.replace(/\$\{[^}\r\n]+\}/gmu, (match) => `__GARLIC_CLAW_BRACED_${bracedValues.push(match) - 1}__`).replace(/\$\(\s*Join-Path\b(?:[^()"'\x60]|"[^"]*"|'[^']*'|`[^`]*`)+\)|\(\s*Join-Path\b(?:[^()"'\x60]|"[^"]*"|'[^']*'|`[^`]*`)+\)/gmu, (match) => `__GARLIC_CLAW_JOIN_PATH_${joinPaths.push(match) - 1}__`);
  return (protectedCommand.match(/&&|\|\||[;|(){}]|"[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+/gmu) ?? []).map((token) => token.replace(/__GARLIC_CLAW_BRACED_(\d+)__/gu, (match, indexText) => bracedValues[Number(indexText)] ?? match).replace(/__GARLIC_CLAW_JOIN_PATH_(\d+)__/gu, (match, indexText) => joinPaths[Number(indexText)] ?? match).trim()).filter((token) => token.length > 0).map((token) => SHELL_SEPARATORS.has(token) ? { kind: 'separator' as const, text: token } : { kind: 'token' as const, text: normalizeRuntimeQuotedToken(token) }).filter((entry) => entry.kind === 'separator' || entry.text.length > 0);
}

function normalizeRuntimeQuotedToken(token: string): string {
  if (token.length >= 2 && token.startsWith('\'') && token.endsWith('\'')) {return `${SINGLE_QUOTED_LITERAL_PREFIX}${token.slice(1, -1).trim()}`;}
  const first = token[0], last = token[token.length - 1];
  return token.length >= 2 && (first === '"' || first === '\'' || first === '`') && first === last ? token.slice(1, -1).trim() : token;
}

function readRuntimeShellRedirectionTokens(command: string): string[] {
  return uniquePreview(Array.from(command.matchAll(/(?:^|[\s;|(){}])(?:\d*>>?|\*>)\s*("[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+)/gmu), (match) => normalizeRuntimeQuotedToken(match[1]?.trim() ?? '')).filter((token) => token.length > 0));
}

function expandRuntimeShellToken(token: string, variables: RuntimeShellVariableMap, usesPowerShell: boolean): string {
  return usesPowerShell ? expandRuntimePowerShellValue(token, variables) : expandRuntimeBashValue(token, variables);
}

function expandRuntimeBashValue(token: string, variables: RuntimeShellVariableMap): string {
  if (token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX)) {return token;}
  return token.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (match, bracedName, simpleName) => variables.get(bracedName || simpleName) ?? readRuntimeProcessEnvValue(bracedName || simpleName) ?? match);
}

function expandRuntimePowerShellValue(token: string, variables: RuntimeShellVariableMap): string {
  if (token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX)) {return token;}
  const providerPrefix = token.match(/^filesystem::/iu)?.[0] ?? '', candidate = providerPrefix ? token.slice(providerPrefix.length) : token;
  const joinPath = readRuntimePowerShellJoinPathValue(candidate, variables);
  if (joinPath) {return `${providerPrefix}${joinPath}`;}
  const value = candidate.replace(/\$\((\$\{env:[^}]+\}|\$env:[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)\)/gu, (match, reference) => readRuntimePowerShellReferenceValue(reference, variables) ?? match).replace(/\$\{env:([^}]+)\}|\$env:([A-Za-z_][A-Za-z0-9_]*)/giu, (match, bracedName, simpleName) => readRuntimeProcessEnvValue(bracedName || simpleName) ?? match).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (match, bracedName, simpleName) => variables.get((bracedName || simpleName).toLowerCase()) ?? match);
  return `${providerPrefix}${value}`;
}

function readRuntimePowerShellAssignedValue(token: string, variables: RuntimeShellVariableMap): string {
  return unwrapRuntimeSingleQuotedLiteral(expandRuntimePowerShellValue(normalizeRuntimeQuotedToken(token.trim()), variables));
}

function readRuntimePowerShellReferenceValue(value: string, variables: RuntimeShellVariableMap): string | undefined {
  const envMatch = value.match(/^\$\{env:([^}]+)\}$|^\$env:([A-Za-z_][A-Za-z0-9_]*)$/iu), localMatch = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$|^\$([A-Za-z_][A-Za-z0-9_]*)$/u);
  return envMatch ? readRuntimeProcessEnvValue(envMatch[1] || envMatch[2]) : localMatch ? variables.get((localMatch[1] || localMatch[2]).toLowerCase()) : undefined;
}

function readRuntimeShellAbsolutePathCandidates(token: string, backendKind: RuntimeBackendKind): string[] {
  const normalized = normalizeRuntimeShellAbsolutePath(token, backendKind), matchedFlag = matchRuntimePowerShellFlag(token, POWERSHELL_PATH_FLAGS), attachedValue = matchedFlag ? readRuntimePowerShellAttachedValue(token, matchedFlag, normalizeRuntimeQuotedToken) : undefined;
  return normalized ? [normalized] : attachedValue ? [normalizeRuntimeShellAbsolutePath(attachedValue, backendKind)].filter((value): value is string => Boolean(value)) : [];
}

function normalizeRuntimeShellAbsolutePath(token: string, backendKind: RuntimeBackendKind): string | undefined {
  const singleQuoted = token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX), providerPrefix = token.match(/^filesystem::/iu)?.[0] ?? '', candidate = providerPrefix ? token.slice(providerPrefix.length) : unwrapRuntimeInspectionToken(token);
  if (isRuntimeAbsolutePath(candidate, backendKind)) {return `${providerPrefix}${candidate}`;}
  if (!singleQuoted) {
    const envPath = expandRuntimeEnvPath(candidate, POWERSHELL_ENV_PATTERNS) ?? expandRuntimeEnvPath(candidate, POSIX_ENV_PATTERNS);
    if (envPath && isRuntimeAbsolutePath(envPath, backendKind)) {return `${providerPrefix}${envPath}`;}
  }
  const joinPath = readRuntimePowerShellJoinPathValue(candidate, new Map());
  return joinPath && isRuntimeAbsolutePath(joinPath, backendKind) ? `${providerPrefix}${joinPath}` : undefined;
}

function readRuntimePowerShellJoinPathValue(token: string, variables: RuntimeShellVariableMap): string | undefined {
  const body = token.startsWith('$(') && token.endsWith(')') ? token.slice(2, -1).trim() : token.startsWith('(') && token.endsWith(')') ? token.slice(1, -1).trim() : token.trim().toLowerCase().startsWith('join-path ') ? token.trim() : undefined;
  if (!body) {return undefined;}
  const entries = tokenizeRuntimeShellCommand(body).filter((entry) => entry.kind === 'token').map((entry) => entry.text);
  if (normalizeRuntimeShellCommand(entries[0] ?? '') !== 'join-path') {return undefined;}
  const args = entries.slice(1), positional = readRuntimePowerShellPositionalValues(args, POWERSHELL_JOIN_PATH_FLAGS);
  const basePath = expandRuntimePowerShellValue(readRuntimePowerShellOptionValues(args, POWERSHELL_JOIN_PATH_PATH_FLAGS, normalizeRuntimeQuotedToken)[0] ?? positional[0] ?? '', variables);
  if (!basePath || !isRuntimeShellAbsolutePathLike(basePath)) {return undefined;}
  const childValues = (readRuntimePowerShellOptionValues(args, POWERSHELL_JOIN_PATH_CHILD_FLAGS, normalizeRuntimeQuotedToken).length > 0 ? readRuntimePowerShellOptionValues(args, POWERSHELL_JOIN_PATH_CHILD_FLAGS, normalizeRuntimeQuotedToken) : positional.slice(1)).map((child) => unwrapRuntimeSingleQuotedLiteral(expandRuntimePowerShellValue(child, variables))).filter((child) => child.length > 0);
  return childValues.reduce(joinRuntimeShellPath, basePath);
}

function isRuntimeAbsolutePath(token: string, backendKind: RuntimeBackendKind): boolean {
  const candidate = unwrapRuntimeInspectionToken(token);
  if (candidate !== token) {return isRuntimeAbsolutePath(candidate, backendKind);}
  if (!token || token.startsWith('-') || /^(https?|git|ssh|ftp):\/\//iu.test(token) || (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(token) && !/^[A-Za-z]:[\\/]/u.test(token))) {return false;}
  return token === '~' || token.startsWith('~/') || token.startsWith('~\\') || token.startsWith('/') || (backendKind === 'native-shell' && /^~[\\/]/u.test(token)) || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(token) || /^filesystem::/iu.test(token);
}

function isRuntimeExternalAbsolutePath(token: string, visibleRoot: string): boolean {
  const candidate = unwrapRuntimeInspectionToken(token);
  if (candidate !== token) {return isRuntimeExternalAbsolutePath(candidate, visibleRoot);}
  if (token === '~' || token.startsWith('~/') || token.startsWith('~\\') || token.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(token)) {return true;}
  if (!token.startsWith('/')) {return false;}
  return visibleRoot !== '/' && normalizeRuntimeVisiblePath(token) !== visibleRoot && !normalizeRuntimeVisiblePath(token).startsWith(`${visibleRoot}/`);
}

function isRuntimeParentTraversalToken(token: string): boolean {
  const candidate = unwrapRuntimeInspectionToken(token);
  return candidate !== token ? isRuntimeParentTraversalToken(candidate) : Boolean(token) && !token.startsWith('-') && /^\.\.([\\/]|$)/u.test(token);
}

function readRuntimeShellNetworkCommands(command: string, args: string[]): string[] {
  const subcommand = normalizeRuntimeShellCommand(args[0] ?? '');
  return NETWORK_COMMANDS.has(command) ? [command] : command === 'git' && GIT_NETWORK_SUBCOMMANDS.has(subcommand) ? [`git ${subcommand}`] : PACKAGE_MANAGER_COMMANDS.has(command) && PACKAGE_MANAGER_NETWORK_SUBCOMMANDS.has(subcommand) ? [`${command} ${subcommand}`] : [];
}

function readRuntimeShellWriteTokens(command: string, args: string[]): string[] {
  return RUNTIME_SHELL_WRITE_RULES[command]?.(args) ?? (WRITE_COMMANDS.has(command) ? readRuntimeDefaultWriteTokens(command, args) : []);
}

const RUNTIME_SHELL_WRITE_RULES: Readonly<Record<string, RuntimeShellWriteRule>> = {
  'add-content': (args) => readRuntimePowerShellWriteTargets(args, POWERSHELL_CONTENT_FLAGS),
  cp: (args) => readRuntimeCopyMoveWriteTargets(args),
  'copy-item': (args) => readRuntimePowerShellDestinationTargets(args),
  curl: (args) => readRuntimeShellFlagValues(args, CURL_WRITE_FLAGS),
  git: (args) => readRuntimeGitWriteTargets(args),
  mkdir: (args) => args.some((token) => POWERSHELL_NEW_ITEM_FLAGS.has(token.toLowerCase())) ? readRuntimePowerShellComposedTargets(args, POWERSHELL_NEW_ITEM_FLAGS, POWERSHELL_NAME_FLAGS, joinRuntimeShellPath) : readRuntimeDefaultWriteTokens('mkdir', args),
  'move-item': (args) => readRuntimePowerShellDestinationTargets(args),
  mv: (args) => readRuntimeCopyMoveWriteTargets(args),
  'new-item': (args) => readRuntimePowerShellComposedTargets(args, POWERSHELL_NEW_ITEM_FLAGS, POWERSHELL_NAME_FLAGS, joinRuntimeShellPath),
  'out-file': (args) => readRuntimePowerShellWriteTargets(args, POWERSHELL_OUT_FILE_FLAGS),
  'remove-item': (args) => readRuntimePowerShellWriteTargets(args, POWERSHELL_REMOVE_ITEM_VALUE_FLAGS, POWERSHELL_REMOVE_ITEM_PATH_FLAGS),
  'rename-item': (args) => readRuntimePowerShellComposedTargets(args, POWERSHELL_RENAME_ITEM_FLAGS, POWERSHELL_NEW_NAME_FLAGS, resolveRuntimeRenamePath),
  scp: (args) => readRuntimeShellDestinationTargets(args, 2),
  'set-content': (args) => readRuntimePowerShellWriteTargets(args, POWERSHELL_CONTENT_FLAGS),
  tar: (args) => readRuntimeTarWriteTargets(args),
  wget: (args) => readRuntimeShellFlagValues(args, WGET_WRITE_FLAGS),
};

function readRuntimeDefaultWriteTokens(command: string, args: string[]): string[] {
  const flagged = command.includes('-') ? readRuntimePowerShellOptionValues(args, POWERSHELL_PATH_FLAGS, normalizeRuntimeQuotedToken) : [];
  return flagged.length > 0 ? flagged : args.filter((token) => !token.startsWith('-') && !(command === 'chmod' && token.startsWith('+')));
}

function readRuntimeCopyMoveWriteTargets(args: string[]): string[] {
  const destination = readRuntimeShellFlagValues(args, CP_MV_DESTINATION_FLAGS);
  return destination.length > 0 ? destination : readRuntimeShellDestinationTargets(args, 2);
}

function readRuntimePowerShellDestinationTargets(args: string[]): string[] {
  const destination = readRuntimePowerShellCommandPath(args, POWERSHELL_DESTINATION_FLAGS) ?? readRuntimePowerShellOptionValues(args, POWERSHELL_DESTINATION_FLAGS, normalizeRuntimeQuotedToken)[0];
  return destination ? [destination] : readRuntimeShellDestinationTargets(args, 2);
}

function readRuntimePowerShellWriteTargets(args: string[], positionalValueFlags: Set<string>, pathFlags = POWERSHELL_PATH_FLAGS): string[] {
  const flagged = readRuntimePowerShellCommandPath(args, pathFlags) ?? readRuntimePowerShellOptionValues(args, pathFlags, normalizeRuntimeQuotedToken)[0];
  return flagged ? [flagged] : readRuntimePowerShellPositionalPathTargets(readRuntimePowerShellPositionalValues(args, positionalValueFlags));
}

function readRuntimePowerShellComposedTargets(args: string[], positionalValueFlags: Set<string>, leafFlags: Set<string>, buildPath: (basePath: string, leafName: string) => string): string[] {
  const positional = readRuntimePowerShellPositionalValues(args, positionalValueFlags), basePath = readRuntimePowerShellOptionValues(args, POWERSHELL_REMOVE_ITEM_PATH_FLAGS, normalizeRuntimeQuotedToken)[0] ?? positional[0], leafName = readRuntimePowerShellOptionValues(args, leafFlags, normalizeRuntimeQuotedToken)[0] ?? positional[1];
  return basePath && leafName ? [buildPath(basePath, leafName)] : basePath ? [basePath] : [];
}

function readRuntimeGitWriteTargets(args: string[]): string[] {
  const subcommand = normalizeRuntimeShellCommand(args[0] ?? ''), nested = normalizeRuntimeShellCommand(args[1] ?? '');
  if (subcommand === 'archive') {return readRuntimeShellFlagValues(args.slice(1), GIT_ARCHIVE_WRITE_FLAGS);}
  if (subcommand === 'bundle' && nested === 'create') {return readRuntimeFlagAwarePositionalValues(args.slice(2), new Set<string>()).slice(0, 1);}
  if (subcommand === 'clone') { const writePaths = readRuntimeShellFlagValues(args.slice(1), GIT_CLONE_WRITE_FLAGS), positional = args.slice(1).filter((token) => !token.startsWith('-')); return positional.length < 2 ? writePaths : uniquePreview([...writePaths, positional[positional.length - 1]]); }
  if (subcommand === 'format-patch') {return readRuntimeShellFlagValues(args.slice(1), GIT_FORMAT_PATCH_WRITE_FLAGS);}
  if (subcommand === 'init') { const positional = readRuntimeFlagAwarePositionalValues(args.slice(1), GIT_INIT_VALUE_FLAGS); return uniquePreview([...readRuntimeShellFlagValues(args.slice(1), GIT_CLONE_WRITE_FLAGS), ...(positional[0] ? [positional[0]] : [])]); }
  if (subcommand === 'submodule' && nested === 'add') { const positional = readRuntimeFlagAwarePositionalValues(args.slice(2), GIT_SUBMODULE_ADD_VALUE_FLAGS); return positional.length >= 2 ? [positional[positional.length - 1]] : []; }
  if (subcommand === 'worktree' && nested === 'add') {return readRuntimeFlagAwarePositionalValues(args.slice(2), GIT_WORKTREE_ADD_VALUE_FLAGS).slice(0, 1);}
  return [];
}

function readRuntimeTarWriteTargets(args: string[]): string[] {
  const writeTokens: string[] = [];
  if (hasRuntimeTarMode(args, TAR_CREATE_FLAGS, SHORT_TAR_CREATE_FLAGS)) {writeTokens.push(...readRuntimeTarFlagValues(args, 'f', TAR_FILE_FLAGS));}
  if (hasRuntimeTarMode(args, TAR_EXTRACT_FLAGS, SHORT_TAR_EXTRACT_FLAGS)) {writeTokens.push(...readRuntimeTarFlagValues(args, 'C', TAR_DIRECTORY_FLAGS));}
  return uniquePreview(writeTokens);
}

function hasRuntimeTarMode(args: string[], longFlags: Set<string>, shortFlags: readonly string[]): boolean {
  return args.some((token) => longFlags.has(token) || shortFlags.some((flag) => token.startsWith('-') && !token.startsWith('--') && token.slice(1).includes(flag)));
}

function readRuntimeTarFlagValues(args: string[], shortFlag: string, longFlags: Set<string>): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--')) {
      const matched = Array.from(longFlags).find((flag) => token === flag || token.startsWith(`${flag}=`));
      if (!matched) {continue;}
      if (token.startsWith(`${matched}=`)) { values.push(token.slice(matched.length + 1)); continue; }
      const next = args[index + 1];
      if (next && !next.startsWith('-')) { values.push(next); index += 1; }
      continue;
    }
    if (!token.startsWith('-') || token.startsWith('--') || !token.slice(1).includes(shortFlag)) {continue;}
    const attached = token.slice(token.indexOf(shortFlag) + 1);
    if (attached.length > 0) { values.push(attached); continue; }
    const next = args[index + 1];
    if (next && !next.startsWith('-')) { values.push(next); index += 1; }
  }
  return values;
}

function readRuntimeShellFlagValues(args: string[], flags: Set<string>): string[] {
  const values: string[] = []; let wantsValue = false;
  for (const token of args) {
    if (wantsValue) { if (!token.startsWith('-')) {values.push(token);} wantsValue = false; continue; }
    const matched = Array.from(flags).find((flag) => token === flag || token.startsWith(`${flag}=`) || (flag.startsWith('-') && !flag.startsWith('--') && token.startsWith(flag) && token.length > flag.length));
    if (!matched) {continue;}
    if (token.startsWith(`${matched}=`)) { values.push(token.slice(matched.length + 1)); continue; }
    if (matched.startsWith('-') && !matched.startsWith('--') && token.length > matched.length) { values.push(token.slice(matched.length)); continue; }
    wantsValue = true;
  }
  return values;
}

function readRuntimeShellDestinationTargets(args: string[], minPositionalCount = 1): string[] {
  const positional = args.filter((token) => !token.startsWith('-'));
  return positional.length >= minPositionalCount ? [positional[positional.length - 1]] : [];
}

function readRuntimePowerShellCommandPath(args: string[], flags: Set<string>): string | undefined {
  for (let index = 0; index < args.length - 1; index += 1) {
    const matched = matchRuntimePowerShellFlag(args[index] ?? '', flags);
    if (!matched || args[index]?.toLowerCase() !== matched) {continue;}
    const next = args[index + 1] ?? '';
    if (normalizeRuntimeShellCommand(next) === 'join-path') {return `(${args.slice(index + 1).join(' ')})`;}
    if (/^\$?\(\s*Join-Path\b/iu.test(next)) {return next;}
  }
  return undefined;
}

function readRuntimePowerShellPositionalPathTargets(positional: string[]): string[] {
  const first = positional[0] ?? '';
  return normalizeRuntimeShellCommand(first) === 'join-path' ? [`(${positional.join(' ')})`] : first ? [first] : [];
}

function resolveRuntimeRenamePath(basePath: string, newName: string): string {
  if (isRuntimeShellAbsolutePathLike(newName)) {return newName;}
  if (/^filesystem::/iu.test(basePath)) {return joinRuntimeShellPath(basePath.match(/^(filesystem::.*?)[\\/][^\\/]+$/u)?.[1] ?? basePath, newName);}
  const normalized = basePath.replace(/[\\/]+$/u, '');
  if (/^[A-Za-z]:[\\/][^\\/]+$/u.test(normalized)) {return joinRuntimeShellPath(normalized.slice(0, 3), newName);}
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return joinRuntimeShellPath(separatorIndex <= 0 ? (normalized.startsWith('/') ? '/' : normalized) : normalized.slice(0, separatorIndex), newName);
}

function readRuntimePowerShellOptionValues(args: string[], flags: Iterable<string>, normalizeValue?: (value: string) => string): string[] {
  const values: string[] = []; let wantsValue = false;
  for (const token of args) {
    if (wantsValue) { if (!token.startsWith('-')) {values.push(normalizeValue ? normalizeValue(token) : token);} wantsValue = false; continue; }
    const matched = matchRuntimePowerShellFlag(token, flags);
    if (!matched) {continue;}
    const attached = readRuntimePowerShellAttachedValue(token, matched, normalizeValue);
    if (attached) { values.push(attached); continue; }
    wantsValue = token.toLowerCase() === matched;
  }
  return values;
}

function matchRuntimePowerShellFlag(token: string, flags: Iterable<string>): string | undefined {
  const normalized = token.toLowerCase();
  return Array.from(flags).find((flag) => normalized === flag || normalized.startsWith(`${flag}:`));
}

function readRuntimePowerShellAttachedValue(token: string, matchedFlag: string, normalizeValue: (value: string) => string = (value) => value): string | undefined {
  return token.toLowerCase().startsWith(`${matchedFlag}:`) ? normalizeValue(token.slice(matchedFlag.length + 1).trim()) || undefined : undefined;
}

function readRuntimePowerShellPositionalValues(args: string[], valueFlags: Iterable<string>): string[] {
  const flags = Array.from(valueFlags), positional: string[] = []; let skipNextValue = false;
  for (const token of args) {
    const normalized = token.toLowerCase();
    if (skipNextValue) { skipNextValue = false; continue; }
    if (flags.includes(normalized)) { skipNextValue = true; continue; }
    if (flags.some((flag) => normalized.startsWith(`${flag}:`)) || token.startsWith('-')) {continue;}
    positional.push(token);
  }
  return positional;
}

function readRuntimeFlagAwarePositionalValues(args: string[], valueFlags: Set<string>): string[] {
  const positional: string[] = []; let skipNextValue = false;
  for (const token of args) {
    if (skipNextValue) { skipNextValue = false; continue; }
    if (token.startsWith('-')) { skipNextValue = valueFlags.has(token.toLowerCase()); continue; }
    positional.push(token);
  }
  return positional;
}

export function usesRuntimePowerShellSyntax(backendKind: RuntimeBackendKind): boolean {
  return process.platform === 'win32' && backendKind.includes('native-shell');
}

function isRuntimeShellAbsolutePathLike(value: string): boolean {
  return value === '~' || value.startsWith('~/') || value.startsWith('~\\') || value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/u.test(value) || /^filesystem::/iu.test(value);
}

function joinRuntimeShellPath(basePath: string, leafName: string): string {
  if (isRuntimeShellAbsolutePathLike(leafName)) {return leafName;}
  const trimmedBase = basePath.replace(/[\\/]+$/u, ''), trimmedLeaf = leafName.replace(/^[\\/]+/u, '');
  return /^filesystem::/iu.test(trimmedBase) || /^[A-Za-z]:$/u.test(trimmedBase) || /^[A-Za-z]:[\\/]/u.test(trimmedBase) || trimmedBase.includes('\\') ? `${trimmedBase}\\${trimmedLeaf}` : `${trimmedBase}/${trimmedLeaf}`;
}

function normalizeRuntimeShellCommand(token: string): string {
  const normalized = token.toLowerCase();
  return COMMAND_ALIASES.get(normalized) ?? normalized;
}

function unwrapRuntimeInspectionToken(token: string): string {
  if (token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX)) {return token.slice(SINGLE_QUOTED_LITERAL_PREFIX.length);}
  return token.match(/^filesystem::(.+)$/iu)?.[1] ?? token;
}

function unwrapRuntimeSingleQuotedLiteral(token: string): string {
  return token.startsWith(SINGLE_QUOTED_LITERAL_PREFIX) ? token.slice(SINGLE_QUOTED_LITERAL_PREFIX.length) : token;
}

function expandRuntimeEnvPath(token: string, patterns: readonly RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = token.match(pattern);
    if (match) {return readRuntimeProcessEnvValue(match[1]) ? `${readRuntimeProcessEnvValue(match[1])}${match[2]}` : undefined;}
  }
  return undefined;
}

function readRuntimeProcessEnvValue(key: string): string | undefined {
  if (process.platform !== 'win32') {return process.env[key];}
  const matchedKey = Object.keys(process.env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return matchedKey ? process.env[matchedKey] : undefined;
}

function uniquePreview(values: string[]): string[] {
  return Array.from(new Set(values)).slice(0, MAX_PREVIEW_ITEMS);
}
