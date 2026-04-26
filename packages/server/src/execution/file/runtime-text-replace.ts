import { BadRequestException } from '@nestjs/common';

export type RuntimeTextReplaceStrategy = 'block-anchor' | 'context-aware' | 'escape-normalized' | 'exact' | 'indentation-flexible' | 'line-ending-normalized' | 'line-trimmed' | 'trailing-whitespace-trimmed' | 'trimmed-boundary' | 'whitespace-normalized';
export interface RuntimeTextReplaceResult { content: string; occurrences: number; strategy: RuntimeTextReplaceStrategy; }
interface RuntimeTextMatch { candidate: string; line: number; startIndex: number; }
interface RuntimeTextSource { lines: string[]; starts: number[]; }

const STRATEGIES: RuntimeTextReplaceStrategy[] = ['exact', 'escape-normalized', 'line-ending-normalized', 'trailing-whitespace-trimmed', 'trimmed-boundary', 'indentation-flexible', 'line-trimmed', 'context-aware', 'block-anchor', 'whitespace-normalized'];
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\'': '\'', '"': '"', '`': '`', '\\': '\\', '\n': '\n', $: '$' };
const NOT_FOUND_MESSAGE = ['edit.oldString 未在文件中找到。', '请重新读取当前文件，确保 oldString 与文件中的文本一致。', '如果目标片段重复出现，请补更多上下文，至少包含前后几行稳定锚点。'].join(' ');

export function replaceRuntimeText(content: string, oldString: string, newString: string, replaceAll = false): RuntimeTextReplaceResult {
  if (oldString === newString) throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
  const source = readSource(content);
  for (const strategy of STRATEGIES) {
    const matches = dedupeMatches(readStrategyMatches(strategy, content, oldString, source));
    if (matches.length === 0) continue;
    if (replaceAll) return replaceAllMatches(content, oldString, newString, strategy, matches);
    if (matches.length > 1) throw new BadRequestException(readAmbiguousMessage(strategy, matches, false));
    const match = matches[0], replacement = normalizeReplacement(strategy, match.candidate, oldString, newString);
    return { content: `${content.slice(0, match.startIndex)}${replacement}${content.slice(match.startIndex + match.candidate.length)}`, occurrences: 1, strategy };
  }
  throw new BadRequestException(NOT_FOUND_MESSAGE);
}

function replaceAllMatches(content: string, oldString: string, newString: string, strategy: RuntimeTextReplaceStrategy, matches: RuntimeTextMatch[]): RuntimeTextReplaceResult {
  const candidates = [...new Set(matches.map((match) => match.candidate))];
  if (candidates.length > 1) throw new BadRequestException(readAmbiguousMessage(strategy, matches, true));
  const candidate = candidates[0], replacement = normalizeReplacement(strategy, candidate, oldString, newString);
  return { content: content.split(candidate).join(replacement), occurrences: countOccurrences(content, candidate), strategy };
}

function readStrategyMatches(strategy: RuntimeTextReplaceStrategy, content: string, find: string, source: RuntimeTextSource): RuntimeTextMatch[] {
  switch (strategy) {
    case 'exact': return readExactMatches(content, find);
    case 'escape-normalized': {
      const unescaped = unescapeValue(find);
      return unescaped === find ? [] : readLooseMatches(content, find, source, unescaped, (block) => unescapeValue(block) === unescaped, true);
    }
    case 'line-ending-normalized': return /[\r\n]/u.test(find) ? readNormalizedMatches(find, source, normalizeLineEndings) : [];
    case 'trailing-whitespace-trimmed': return readNormalizedMatches(find, source, (line) => line.trimEnd(), true);
    case 'trimmed-boundary': {
      const trimmed = find.trim();
      return trimmed === find ? [] : readLooseMatches(content, find, source, trimmed, (block) => block.trim() === trimmed);
    }
    case 'indentation-flexible': {
      const lines = splitFindLines(find), normalized = normalizeIndentationBlock(lines.join('\n'));
      return readWindowMatches(source, find, lines, (block) => normalizeIndentationBlock(block.join('\n')) === normalized);
    }
    case 'line-trimmed': return readNormalizedMatches(find, source, (line) => line.trim());
    case 'context-aware': return readAnchoredMatches(find, source, true);
    case 'block-anchor': return readAnchoredMatches(find, source, false);
    case 'whitespace-normalized': return readLooseMatches(content, find, source, '', (block) => normalizeWhitespace(block) === normalizeWhitespace(find));
  }
}

function readSource(content: string): RuntimeTextSource {
  const lines = content.split('\n'), starts: number[] = [];
  let index = 0;
  for (const line of lines) { starts.push(index); index += line.length + 1; }
  return { lines, starts };
}

function readExactMatches(content: string, target: string): RuntimeTextMatch[] {
  if (!target.length) return [];
  const matches: RuntimeTextMatch[] = [];
  for (let index = 0; index <= content.length;) {
    const startIndex = content.indexOf(target, index);
    if (startIndex < 0) break;
    matches.push({ candidate: target, line: startIndex <= 0 ? 1 : content.slice(0, startIndex).split('\n').length, startIndex });
    index = startIndex + target.length;
  }
  return matches;
}

function readLooseMatches(content: string, find: string, source: RuntimeTextSource, exactCandidate: string, matchesBlock: (block: string) => boolean, skipSingleLineBlock = false): RuntimeTextMatch[] {
  const lines = splitFindLines(find), exactMatches = exactCandidate ? readExactMatches(content, exactCandidate) : [];
  return skipSingleLineBlock && lines.length < 2 ? exactMatches : [...exactMatches, ...readWindowMatches(source, find, lines, (block) => matchesBlock(block.join('\n')))];
}

function readNormalizedMatches(find: string, source: RuntimeTextSource, normalize: (line: string) => string, skipIfUnchanged = false): RuntimeTextMatch[] {
  const lines = splitFindLines(find), normalized = lines.map(normalize);
  return skipIfUnchanged && normalized.every((line, index) => line === lines[index]) ? [] : readWindowMatches(source, find, lines, (block) => block.every((line, index) => normalize(line) === normalized[index]));
}

function readWindowMatches(source: RuntimeTextSource, find: string, findLines: string[], matches: (block: string[], lineIndex: number) => boolean): RuntimeTextMatch[] {
  if (findLines.length === 0 || findLines.length > source.lines.length) return [];
  const result: RuntimeTextMatch[] = [];
  for (let lineIndex = 0; lineIndex <= source.lines.length - findLines.length; lineIndex += 1) {
    const block = source.lines.slice(lineIndex, lineIndex + findLines.length);
    if (matches(block, lineIndex)) result.push({ candidate: find.endsWith('\n') ? `${block.join('\n')}\n` : block.join('\n'), line: lineIndex + 1, startIndex: source.starts[lineIndex] ?? 0 });
  }
  return result;
}

function readAnchoredMatches(find: string, source: RuntimeTextSource, fixedLength: boolean): RuntimeTextMatch[] {
  const lines = splitFindLines(find);
  if (lines.length < 3) return [];
  const first = lines[0].trim(), last = lines.at(-1)?.trim() ?? '';
  let best = 0.5;
  const matches: RuntimeTextMatch[] = [];
  for (let start = 0; start < source.lines.length; start += 1) {
    if (source.lines[start].trim() !== first) continue;
    for (let end = start + (fixedLength ? lines.length - 1 : 2); end < source.lines.length; end += 1) {
      if (fixedLength && end > start + lines.length - 1) break;
      if (source.lines[end].trim() !== last) continue;
      const block = source.lines.slice(start, end + 1);
      if (fixedLength && block.length !== lines.length) continue;
      const score = readAnchorSimilarity(block, lines, fixedLength);
      if (score < 0.5) continue;
      const match = { candidate: find.endsWith('\n') ? `${block.join('\n')}\n` : block.join('\n'), line: start + 1, startIndex: source.starts[start] ?? 0 };
      if (score > best + 0.0001) { best = score; matches.length = 0; matches.push(match); } else if (Math.abs(score - best) < 0.0001) matches.push(match);
      break;
    }
  }
  return matches;
}

function readAnchorSimilarity(block: string[], find: string[], fixedLength: boolean): number {
  const middle = Math.min(block.length, find.length) - 2;
  if (middle <= 0) return 1;
  let matched = 0, total = 0;
  for (let index = 1; index <= middle; index += 1) {
    const left = block[index].trim(), right = find[index].trim();
    if (fixedLength) {
      if (!left.length && !right.length) continue;
      total += 1; if (left === right) matched += 1;
      continue;
    }
    const maxLength = Math.max(left.length, right.length);
    total += 1; matched += maxLength === 0 ? 1 : 1 - readLevenshtein(left, right) / maxLength;
  }
  return total === 0 ? 1 : matched / total;
}

function normalizeReplacement(strategy: RuntimeTextReplaceStrategy, candidate: string, target: string, replacement: string): string {
  return normalizeReplacementLineEndings(candidate, strategy === 'indentation-flexible' ? normalizeIndentationReplacement(candidate, target, replacement) : replacement);
}

function normalizeReplacementLineEndings(candidate: string, replacement: string): string {
  const replacementEndings = Array.from(replacement.matchAll(/\r?\n/g), (match) => match[0]), candidateEndings = Array.from(candidate.matchAll(/\r?\n/g), (match) => match[0]);
  if (replacementEndings.length === 0 || candidateEndings.length === 0) return replacement;
  const preferred = candidateEndings.filter((lineEnding) => lineEnding === '\r\n').length * 2 >= candidateEndings.length ? '\r\n' : '\n';
  const endings = candidateEndings.length === replacementEndings.length ? candidateEndings : Array.from({ length: replacementEndings.length }, () => preferred);
  return replacement.split(/\r?\n/g).reduce((text, part, index) => index === 0 ? part : `${text}${endings[index - 1]}${part}`, '');
}

function normalizeIndentationReplacement(candidate: string, target: string, replacement: string): string {
  const candidateIndent = readCommonIndentation(normalizeLineEndings(candidate)), targetIndent = readCommonIndentation(normalizeLineEndings(target));
  if (candidateIndent === targetIndent) return normalizeLineEndings(replacement);
  return normalizeLineEndings(replacement).split('\n').map((line) => !line.trim().length ? line : !targetIndent.length ? `${candidateIndent}${line}` : line.startsWith(targetIndent) ? `${candidateIndent}${line.slice(targetIndent.length)}` : line).join('\n');
}

function normalizeIndentationBlock(value: string): string {
  const indentation = readCommonIndentation(value);
  return indentation ? value.split('\n').map((line) => !line.trim().length ? line : line.startsWith(indentation) ? line.slice(indentation.length) : line).join('\n') : value;
}

function readCommonIndentation(value: string): string {
  const lines = splitFindLines(value).filter((line) => line.trim().length > 0);
  return lines.reduce((common, line) => {
    const current = line.match(/^\s*/u)?.[0] ?? '';
    return !common.length || current.length < common.length ? current : common;
  }, lines[0]?.match(/^\s*/u)?.[0] ?? '');
}

function readAmbiguousMessage(strategy: RuntimeTextReplaceStrategy, matches: RuntimeTextMatch[], replaceAll: boolean): string {
  return [`edit.oldString 按 ${strategy} 策略匹配到多个位置。`, `当前命中 ${matches.length} 处：${matches.slice(0, 5).map((match) => `第 ${match.line} 行`).join('、')}${matches.length > 5 ? ' 等' : ''}。`, replaceAll ? 'replaceAll 只允许同一段文本的全量替换；请补更多上下文，让匹配先收敛到同一段原文。' : '请补更多上下文，缩小到唯一位置，或者在确认它们是同一段原文后再使用 replaceAll。'].join(' ');
}

function dedupeMatches(matches: RuntimeTextMatch[]): RuntimeTextMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.startIndex}:${match.candidate}`;
    if (!match.candidate.length || match.startIndex < 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countOccurrences(content: string, target: string): number {
  let count = 0, index = 0;
  while (target.length > 0 && index <= content.length) {
    const matched = content.indexOf(target, index);
    if (matched < 0) break;
    count += 1; index = matched + target.length;
  }
  return count;
}

function splitFindLines(find: string): string[] {
  const lines = find.split('\n');
  return lines.length > 0 && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

function normalizeWhitespace(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function normalizeLineEndings(value: string): string { return value.replace(/\r\n/g, '\n').replace(/\r/g, ''); }

function unescapeValue(value: string): string {
  return value.replace(/\\u([0-9A-Fa-f]{4})|\\x([0-9A-Fa-f]{2})|\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, unicodeHex, byteHex, token) => unicodeHex ? String.fromCodePoint(Number.parseInt(unicodeHex, 16)) : byteHex ? String.fromCodePoint(Number.parseInt(byteHex, 16)) : ESCAPES[token] ?? match);
}

function readLevenshtein(left: string, right: string): number {
  if (!left.length || !right.length) return Math.max(left.length, right.length);
  const matrix = Array.from({ length: left.length + 1 }, (_, row) => Array.from({ length: right.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : 0));
  for (let row = 1; row <= left.length; row += 1) for (let column = 1; column <= right.length; column += 1) matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
  return matrix[left.length][right.length];
}
