import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { normalizeRuntimeVisiblePath } from './runtime-visible-path';

const FILE_COMMANDS = new Set([
  'cd',
  'pushd',
  'popd',
  'cat',
  'cp',
  'mv',
  'rm',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'tar',
  'get-content',
  'out-file',
  'set-content',
  'add-content',
  'copy-item',
  'move-item',
  'remove-item',
  'new-item',
  'rename-item',
  'set-location',
  'push-location',
]);

const CD_COMMANDS = new Set(['cd', 'pushd', 'popd', 'set-location', 'push-location']);
const WRITE_COMMANDS = new Set([
  'cp',
  'mv',
  'rm',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'tar',
  'out-file',
  'set-content',
  'add-content',
  'copy-item',
  'invoke-webrequest',
  'move-item',
  'remove-item',
  'new-item',
  'rename-item',
]);
const COMMAND_ALIASES = new Map<string, string>([
  ['gc', 'get-content'],
  ['irm', 'invoke-restmethod'],
  ['iwr', 'invoke-webrequest'],
  ['sc', 'set-content'],
  ['ac', 'add-content'],
  ['sl', 'set-location'],
  ['ni', 'new-item'],
  ['md', 'mkdir'],
  ['rd', 'remove-item'],
  ['ren', 'rename-item'],
]);
const POWERSHELL_PATH_PARAMETER_FLAGS = new Set([
  '-path',
  '-filepath',
  '-literalpath',
  '-destination',
  '-outfile',
  '-outputfile',
]);
const POWERSHELL_DESTINATION_PARAMETER_FLAGS = new Set(['-destination']);
const CURL_WRITE_PATH_FLAGS = new Set(['-o', '--output']);
const CP_MV_DESTINATION_FLAGS = new Set(['-t', '--target-directory']);
const GIT_ARCHIVE_WRITE_PATH_FLAGS = new Set(['-o', '--output']);
const GIT_CLONE_WRITE_PATH_FLAGS = new Set(['--separate-git-dir']);
const GIT_FORMAT_PATCH_WRITE_PATH_FLAGS = new Set(['-o', '--output-directory']);
const GIT_INIT_VALUE_FLAGS = new Set(['-b', '-c', '--initial-branch', '--object-format', '--ref-format', '--template']);
const GIT_SUBMODULE_ADD_VALUE_FLAGS = new Set(['-b', '--branch', '--depth', '--name', '--reference']);
const GIT_WORKTREE_ADD_VALUE_FLAGS = new Set(['-b', '-B', '--orphan', '--reason']);
const TAR_CREATE_LONG_FLAGS = new Set(['--append', '--catenate', '--concatenate', '--create', '--update']);
const TAR_EXTRACT_LONG_FLAGS = new Set(['--extract', '--get']);
const WGET_WRITE_PATH_FLAGS = new Set(['-O', '--output-document', '--output-file', '-P', '--directory-prefix']);
const MAX_PREVIEW_ITEMS = 3;

export interface RuntimeShellCommandHintMetadata {
  absolutePaths?: string[];
  externalAbsolutePaths?: string[];
  externalWritePaths?: string[];
  fileCommands?: string[];
  networkTouchesExternalPath?: boolean;
  networkCommands?: string[];
  parentTraversalPaths?: string[];
  usesNetworkCommand?: boolean;
  usesParentTraversal?: boolean;
  redundantCdWithWorkdir?: boolean;
  usesCd?: boolean;
  usesWindowsAndAnd?: boolean;
  writesExternalPath?: boolean;
}

export interface RuntimeShellCommandHints {
  metadata?: RuntimeShellCommandHintMetadata;
  summary?: string;
}

interface ReadRuntimeShellCommandHintsInput {
  backendKind: RuntimeBackendKind;
  command: string;
  visibleRoot: string;
  workdir?: string;
}

interface ShellCommandTokenEntry {
  kind: 'separator' | 'token';
  text: string;
}

interface RuntimeShellCommandSegment {
  command: string;
  tokens: string[];
}

export function readRuntimeShellCommandHints(
  input: ReadRuntimeShellCommandHintsInput,
): RuntimeShellCommandHints {
  const tokenEntries = tokenizeShellCommand(input.command);
  const tokens = tokenEntries
    .filter((entry) => entry.kind === 'token')
    .map((entry) => entry.text);
  if (tokens.length === 0) {
    return {};
  }

  const segments = readShellCommandSegments(tokenEntries);
  const fileCommands = uniquePreview(
    segments
      .map((segment) => segment.command)
      .filter((command) => FILE_COMMANDS.has(command)),
  );
  const networkCommands = readRuntimeShellNetworkCommands(tokens);
  const usesNetworkCommand = networkCommands.length > 0;
  const usesCd = segments.some((segment) => CD_COMMANDS.has(segment.command));
  const redundantCdWithWorkdir = Boolean(input.workdir && usesCd);
  const usesWindowsAndAnd = input.backendKind === 'native-shell'
    && process.platform === 'win32'
    && input.command.includes('&&');
  const absolutePaths = uniquePreview(
    tokens.filter((token) => isShellAbsolutePathToken(token, input.backendKind)),
  );
  const parentTraversalPaths = uniquePreview(
    tokens.filter((token) => isShellParentTraversalToken(token)),
  );
  const externalAbsolutePaths = uniquePreview(
    absolutePaths.filter((token) => isExternalAbsolutePathToken(token, input.visibleRoot)),
  );
  const externalWritePaths = uniquePreview(
    [
      ...segments.flatMap((segment) => {
        return readShellCommandWritePathTokens(segment);
      }),
      ...readShellRedirectionPathTokens(input.command),
    ]
      .filter((token) => isShellAbsolutePathToken(token, input.backendKind))
      .filter((token) => isExternalAbsolutePathToken(token, input.visibleRoot)),
  );
  const networkTouchesExternalPath = usesNetworkCommand && externalAbsolutePaths.length > 0;
  const writesExternalPath = externalWritePaths.length > 0;
  const usesParentTraversal = parentTraversalPaths.length > 0;

  const metadata: RuntimeShellCommandHintMetadata = {
    ...(externalWritePaths.length > 0 ? { externalWritePaths } : {}),
    ...(networkTouchesExternalPath ? { networkTouchesExternalPath: true } : {}),
    ...(networkCommands.length > 0 ? { networkCommands } : {}),
    ...(parentTraversalPaths.length > 0 ? { parentTraversalPaths } : {}),
    ...(usesNetworkCommand ? { usesNetworkCommand: true } : {}),
    ...(usesParentTraversal ? { usesParentTraversal: true } : {}),
    ...(redundantCdWithWorkdir ? { redundantCdWithWorkdir: true } : {}),
    ...(usesCd ? { usesCd: true } : {}),
    ...(usesWindowsAndAnd ? { usesWindowsAndAnd: true } : {}),
    ...(writesExternalPath ? { writesExternalPath: true } : {}),
    ...(fileCommands.length > 0 ? { fileCommands } : {}),
    ...(absolutePaths.length > 0 ? { absolutePaths } : {}),
    ...(externalAbsolutePaths.length > 0 ? { externalAbsolutePaths } : {}),
  };
  const summaryParts = readRuntimeShellCommandHintSummaryParts({
    externalWritePaths,
    externalAbsolutePaths,
    fileCommands,
    networkTouchesExternalPath,
    networkCommands,
    parentTraversalPaths,
    redundantCdWithWorkdir,
    usesCd,
    usesNetworkCommand,
    usesParentTraversal,
    usesWindowsAndAnd,
    writesExternalPath,
  });
  return {
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(summaryParts.length > 0 ? { summary: `静态提示: ${summaryParts.join('、')}` } : {}),
  };
}

function tokenizeShellCommand(command: string): ShellCommandTokenEntry[] {
  const matches = command.match(/&&|\|\||[;|()]|"[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+/gmu);
  return (matches ?? [])
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .reduce<ShellCommandTokenEntry[]>((entries, token) => {
      if (isShellCommandSeparator(token)) {
        entries.push({ kind: 'separator', text: token });
        return entries;
      }
      const stripped = stripOuterQuotes(token);
      if (!stripped) {
        return entries;
      }
      entries.push({ kind: 'token', text: stripped });
      return entries;
    }, []);
}

function stripOuterQuotes(token: string): string {
  if (token.length < 2) {
    return token;
  }
  const first = token[0];
  const last = token[token.length - 1];
  if ((first === '"' || first === '\'' || first === '`') && first === last) {
    return token.slice(1, -1).trim();
  }
  return token;
}

function isShellCommandSeparator(token: string): boolean {
  return ['&&', '||', ';', '|', '(', ')'].includes(token);
}

function readShellCommandSegments(entries: ShellCommandTokenEntry[]): RuntimeShellCommandSegment[] {
  const segments: RuntimeShellCommandSegment[] = [];
  let current: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'separator') {
      if (current.length > 0) {
        segments.push({
          command: normalizeShellCommandToken(current[0]),
          tokens: current,
        });
        current = [];
      }
      continue;
    }
    current.push(entry.text);
  }
  if (current.length > 0) {
    segments.push({
      command: normalizeShellCommandToken(current[0]),
      tokens: current,
    });
  }
  return segments;
}

function isShellAbsolutePathToken(token: string, backendKind: RuntimeBackendKind): boolean {
  const normalizedToken = unwrapFilesystemProviderToken(token);
  if (normalizedToken !== token) {
    return isShellAbsolutePathToken(normalizedToken, backendKind);
  }
  if (!token || token.startsWith('-')) {
    return false;
  }
  if (/^(https?|git|ssh|ftp):\/\//iu.test(token)) {
    return false;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(token) && !/^[A-Za-z]:[\\/]/u.test(token)) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/u.test(token) || token.startsWith('\\\\')) {
    return true;
  }
  if (token === '~') {
    return true;
  }
  if (token.startsWith('~/') || token.startsWith('~\\')) {
    return true;
  }
  if (token.startsWith('/')) {
    return true;
  }
  if (backendKind === 'native-shell' && /^~[\\/]/u.test(token)) {
    return true;
  }
  return false;
}

function isExternalAbsolutePathToken(token: string, visibleRoot: string): boolean {
  const normalizedToken = unwrapFilesystemProviderToken(token);
  if (normalizedToken !== token) {
    return isExternalAbsolutePathToken(normalizedToken, visibleRoot);
  }
  if (/^[A-Za-z]:[\\/]/u.test(token) || token.startsWith('\\\\') || token.startsWith('~/') || token.startsWith('~\\')) {
    return true;
  }
  if (token === '~') {
    return true;
  }
  if (!token.startsWith('/')) {
    return false;
  }
  if (visibleRoot === '/') {
    return false;
  }
  const normalized = normalizeRuntimeVisiblePath(token);
  return normalized !== visibleRoot && !normalized.startsWith(`${visibleRoot}/`);
}

function isShellParentTraversalToken(token: string): boolean {
  const normalizedToken = unwrapFilesystemProviderToken(token);
  if (normalizedToken !== token) {
    return isShellParentTraversalToken(normalizedToken);
  }
  if (!token || token.startsWith('-')) {
    return false;
  }
  return /^\.\.([\\/]|$)/u.test(token);
}

function uniquePreview(values: string[]): string[] {
  return Array.from(new Set(values)).slice(0, MAX_PREVIEW_ITEMS);
}

function readRuntimeShellCommandHintSummaryParts(input: {
  externalWritePaths: string[];
  externalAbsolutePaths: string[];
  fileCommands: string[];
  networkTouchesExternalPath: boolean;
  networkCommands: string[];
  parentTraversalPaths: string[];
  redundantCdWithWorkdir: boolean;
  usesCd: boolean;
  usesNetworkCommand: boolean;
  usesParentTraversal: boolean;
  usesWindowsAndAnd: boolean;
  writesExternalPath: boolean;
}): string[] {
  return [
    ...(input.usesCd ? ['含 cd'] : []),
    ...(input.redundantCdWithWorkdir ? ['已提供 workdir，命令里仍含 cd'] : []),
    ...(input.usesParentTraversal
      ? [`相对上级路径: ${input.parentTraversalPaths.join(', ')}`]
      : []),
    ...(input.usesNetworkCommand ? [`联网命令: ${input.networkCommands.join(', ')}`] : []),
    ...(input.networkTouchesExternalPath
      ? [`联网命令涉及外部绝对路径: ${input.externalAbsolutePaths.join(', ')}`]
      : []),
    ...(input.writesExternalPath
      ? [`写入命令涉及外部绝对路径: ${input.externalWritePaths.join(', ')}`]
      : []),
    ...(input.usesWindowsAndAnd ? ['Windows native-shell 中不建议使用 &&'] : []),
    ...(input.fileCommands.length > 0 ? [`文件命令: ${input.fileCommands.join(', ')}`] : []),
    ...(input.externalAbsolutePaths.length > 0
      ? [`外部绝对路径: ${input.externalAbsolutePaths.join(', ')}`]
      : []),
  ];
}

function readShellCommandPathTokens(tokens: string[]): string[] {
  const normalizedCommand = normalizeShellCommandToken(tokens[0] ?? '');
  const args = tokens.slice(1);
  if (normalizedCommand.includes('-')) {
    const flaggedPaths = readPowerShellFlaggedPathTokens(args);
    if (flaggedPaths.length > 0) {
      return flaggedPaths;
    }
  }
  return args.filter((token) => !token.startsWith('-') && !(normalizedCommand === 'chmod' && token.startsWith('+')));
}

function readShellCommandWritePathTokens(segment: RuntimeShellCommandSegment): string[] {
  if (segment.command === 'cp' || segment.command === 'mv') {
    return readCopyMoveWritePathTokens(segment.tokens.slice(1));
  }
  if (segment.command === 'copy-item' || segment.command === 'move-item') {
    return readPowerShellDestinationPathTokens(segment.tokens.slice(1));
  }
  if (segment.command === 'curl') {
    return readShellFlaggedPathTokens(segment.tokens.slice(1), CURL_WRITE_PATH_FLAGS);
  }
  if (segment.command === 'git') {
    return readGitWritePathTokens(segment.tokens.slice(1));
  }
  if (segment.command === 'tar') {
    return readTarWritePathTokens(segment.tokens.slice(1));
  }
  if (segment.command === 'wget') {
    return readShellFlaggedPathTokens(segment.tokens.slice(1), WGET_WRITE_PATH_FLAGS);
  }
  if (segment.command === 'scp') {
    return readScpWritePathTokens(segment.tokens.slice(1));
  }
  if (!WRITE_COMMANDS.has(segment.command)) {
    return [];
  }
  return readShellCommandPathTokens(segment.tokens);
}

function readShellRedirectionPathTokens(command: string): string[] {
  const matches = command.matchAll(/(?:^|[\s;|()])(?:\d*>>?|\*>)\s*("[^"]*"|'[^']*'|`[^`]*`|[^\s;|&(){}<>]+)/gmu);
  return uniquePreview(
    Array.from(matches, (match) => stripOuterQuotes(match[1]?.trim() ?? ''))
      .filter((token) => token.length > 0),
  );
}

function readPowerShellFlaggedPathTokens(tokens: string[]): string[] {
  return readPowerShellFlaggedPathTokensWithFlags(tokens, POWERSHELL_PATH_PARAMETER_FLAGS);
}

function readPowerShellDestinationPathTokens(tokens: string[]): string[] {
  const flaggedDestinations = readPowerShellFlaggedPathTokensWithFlags(tokens, POWERSHELL_DESTINATION_PARAMETER_FLAGS);
  if (flaggedDestinations.length > 0) {
    return flaggedDestinations;
  }
  return readShellDestinationPathTokens(tokens, 2);
}

function readPowerShellFlaggedPathTokensWithFlags(tokens: string[], flags: Set<string>): string[] {
  const paths: string[] = [];
  let wantsPath = false;
  for (const token of tokens) {
    if (wantsPath) {
      if (!token.startsWith('-')) {
        paths.push(token);
      }
      wantsPath = false;
      continue;
    }
    if (!token.startsWith('-')) {
      continue;
    }
    wantsPath = flags.has(token.toLowerCase());
  }
  return paths;
}

function readShellFlaggedPathTokens(tokens: string[], flags: Set<string>): string[] {
  const paths: string[] = [];
  let wantsPath = false;
  for (const token of tokens) {
    if (wantsPath) {
      if (!token.startsWith('-')) {
        paths.push(token);
      }
      wantsPath = false;
      continue;
    }
    const matchedFlag = Array.from(flags).find((flag) => matchesShellFlagToken(token, flag));
    if (matchedFlag) {
      if (token.startsWith(`${matchedFlag}=`)) {
        paths.push(token.slice(matchedFlag.length + 1));
        continue;
      }
      if (matchedFlag.startsWith('-') && !matchedFlag.startsWith('--') && token.length > matchedFlag.length) {
        paths.push(token.slice(matchedFlag.length));
        continue;
      }
      wantsPath = true;
    }
  }
  return paths;
}

function matchesShellFlagToken(token: string, flag: string): boolean {
  return token === flag || token.startsWith(`${flag}=`);
}

function readScpWritePathTokens(tokens: string[]): string[] {
  return readShellDestinationPathTokens(tokens, 2);
}

function readCopyMoveWritePathTokens(tokens: string[]): string[] {
  const flaggedDestinations = readShellFlaggedPathTokens(tokens, CP_MV_DESTINATION_FLAGS);
  if (flaggedDestinations.length > 0) {
    return flaggedDestinations;
  }
  return readShellDestinationPathTokens(tokens, 2);
}

function readShellDestinationPathTokens(tokens: string[], minPositionalCount = 1): string[] {
  const positional = tokens.filter((token) => !token.startsWith('-'));
  if (positional.length < minPositionalCount) {
    return [];
  }
  const destination = positional[positional.length - 1];
  return destination ? [destination] : [];
}

function readGitWritePathTokens(tokens: string[]): string[] {
  const subcommand = normalizeShellCommandToken(tokens[0] ?? '');
  if (subcommand === 'clone') {
    const writePaths = readShellFlaggedPathTokens(tokens.slice(1), GIT_CLONE_WRITE_PATH_FLAGS);
    const positional = tokens.slice(1).filter((token) => !token.startsWith('-'));
    if (positional.length < 2) {
      return writePaths;
    }
    const destination = positional[positional.length - 1];
    return uniquePreview(destination ? [...writePaths, destination] : writePaths);
  }
  if (subcommand === 'init') {
    const writePaths = readShellFlaggedPathTokens(tokens.slice(1), GIT_CLONE_WRITE_PATH_FLAGS);
    const positional = readShellPositionalTokens(tokens.slice(1), GIT_INIT_VALUE_FLAGS);
    const destination = positional[0];
    return uniquePreview(destination ? [...writePaths, destination] : writePaths);
  }
  if (subcommand === 'archive') {
    return readShellFlaggedPathTokens(tokens.slice(1), GIT_ARCHIVE_WRITE_PATH_FLAGS);
  }
  if (subcommand === 'bundle' && normalizeShellCommandToken(tokens[1] ?? '') === 'create') {
    const destination = readShellPositionalTokens(tokens.slice(2), new Set())[0];
    return destination ? [destination] : [];
  }
  if (subcommand === 'format-patch') {
    return readShellFlaggedPathTokens(tokens.slice(1), GIT_FORMAT_PATCH_WRITE_PATH_FLAGS);
  }
  if (subcommand === 'worktree' && normalizeShellCommandToken(tokens[1] ?? '') === 'add') {
    const destination = readShellPositionalTokens(tokens.slice(2), GIT_WORKTREE_ADD_VALUE_FLAGS)[0];
    return destination ? [destination] : [];
  }
  if (subcommand === 'submodule' && normalizeShellCommandToken(tokens[1] ?? '') === 'add') {
    const positional = readShellPositionalTokens(tokens.slice(2), GIT_SUBMODULE_ADD_VALUE_FLAGS);
    const destination = positional.length >= 2 ? positional[positional.length - 1] : undefined;
    return destination ? [destination] : [];
  }
  return [];
}

function readShellPositionalTokens(tokens: string[], valueFlags: Set<string>): string[] {
  const positional: string[] = [];
  let skipNextValue = false;
  for (const token of tokens) {
    if (skipNextValue) {
      skipNextValue = false;
      continue;
    }
    if (token.startsWith('-')) {
      if (valueFlags.has(token)) {
        skipNextValue = true;
      }
      continue;
    }
    positional.push(token);
  }
  return positional;
}

function readTarWritePathTokens(tokens: string[]): string[] {
  const writes: string[] = [];
  if (usesTarCreateMode(tokens)) {
    writes.push(...readTarFlagValues(tokens, 'f', new Set(['--file'])));
  }
  if (usesTarExtractMode(tokens)) {
    writes.push(...readTarFlagValues(tokens, 'C', new Set(['--directory'])));
  }
  return uniquePreview(writes);
}

function usesTarCreateMode(tokens: string[]): boolean {
  return tokens.some((token) => TAR_CREATE_LONG_FLAGS.has(token) || tokenHasTarShortFlag(token, 'c')
    || tokenHasTarShortFlag(token, 'r') || tokenHasTarShortFlag(token, 'u'));
}

function usesTarExtractMode(tokens: string[]): boolean {
  return tokens.some((token) => TAR_EXTRACT_LONG_FLAGS.has(token) || tokenHasTarShortFlag(token, 'x'));
}

function tokenHasTarShortFlag(token: string, flag: string): boolean {
  if (!token.startsWith('-') || token.startsWith('--')) {
    return false;
  }
  return token.slice(1).includes(flag);
}

function readTarFlagValues(tokens: string[], shortFlag: string, longFlags: Set<string>): string[] {
  const values: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('--')) {
      const matchedFlag = Array.from(longFlags).find((flag) => matchesShellFlagToken(token, flag));
      if (!matchedFlag) {
        continue;
      }
      if (token.startsWith(`${matchedFlag}=`)) {
        values.push(token.slice(matchedFlag.length + 1));
        continue;
      }
      const nextToken = tokens[index + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        values.push(nextToken);
        index += 1;
      }
      continue;
    }
    if (!token.startsWith('-')) {
      continue;
    }
    const raw = token.slice(1);
    const flagIndex = raw.indexOf(shortFlag);
    if (flagIndex === -1) {
      continue;
    }
    const attachedValue = raw.slice(flagIndex + 1);
    if (attachedValue.length > 0) {
      values.push(attachedValue);
      continue;
    }
    const nextToken = tokens[index + 1];
    if (nextToken && !nextToken.startsWith('-')) {
      values.push(nextToken);
      index += 1;
    }
  }
  return values;
}

function normalizeShellCommandToken(token: string): string {
  const normalized = token.toLowerCase();
  return COMMAND_ALIASES.get(normalized) ?? normalized;
}

function unwrapFilesystemProviderToken(token: string): string {
  const match = token.match(/^filesystem::(.+)$/iu);
  return match?.[1] ?? token;
}

export function requiresRuntimeShellNetworkAccess(command: string): boolean {
  return readRuntimeShellNetworkCommands(
    tokenizeShellCommand(command)
      .filter((entry) => entry.kind === 'token')
      .map((entry) => entry.text),
  ).length > 0;
}

function readRuntimeShellNetworkCommands(tokens: string[]): string[] {
  const normalizedTokens = tokens.map(normalizeShellCommandToken);
  const result: string[] = [];
  for (let index = 0; index < normalizedTokens.length; index += 1) {
    const token = normalizedTokens[index];
    const nextToken = normalizedTokens[index + 1];
    if ([
      'curl',
      'wget',
      'fetch',
      'nc',
      'telnet',
      'ssh',
      'scp',
      'sftp',
      'invoke-webrequest',
      'invoke-restmethod',
    ].includes(token)) {
      result.push(token);
      continue;
    }
    if (token === 'git' && nextToken && ['clone', 'fetch', 'pull'].includes(nextToken)) {
      result.push(`git ${nextToken}`);
      continue;
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(token) && nextToken && ['install', 'add'].includes(nextToken)) {
      result.push(`${token} ${nextToken}`);
      continue;
    }
  }
  return uniquePreview(result);
}
