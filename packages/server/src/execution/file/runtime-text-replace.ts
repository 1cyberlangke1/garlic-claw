import { BadRequestException } from '@nestjs/common';

export type RuntimeTextReplaceStrategy =
  | 'block-anchor'
  | 'context-aware'
  | 'exact'
  | 'indentation-flexible'
  | 'line-trimmed'
  | 'trimmed-boundary'
  | 'whitespace-normalized';

export interface RuntimeTextReplaceResult {
  content: string;
  occurrences: number;
  strategy: RuntimeTextReplaceStrategy;
}

interface RuntimeTextReplaceMatch {
  candidate: string;
  line: number;
  startIndex: number;
}

export function replaceRuntimeText(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): RuntimeTextReplaceResult {
  if (oldString === newString) {
    throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');
  }
  for (const strategy of runtimeTextReplaceStrategies) {
    const matches = dedupeRuntimeTextMatches(strategy.read(content, oldString));
    if (matches.length === 0) {
      continue;
    }
    if (replaceAll) {
      const candidateValues = Array.from(new Set(matches.map((match) => match.candidate)));
      if (candidateValues.length > 1) {
        throw new BadRequestException(readRuntimeTextAmbiguousMessage(strategy.name, matches, true));
      }
      const matched = candidateValues[0];
      return {
        content: content.split(matched).join(newString),
        occurrences: countRuntimeTextOccurrences(content, matched),
        strategy: strategy.name,
      };
    }
    if (matches.length > 1) {
      throw new BadRequestException(readRuntimeTextAmbiguousMessage(strategy.name, matches, false));
    }
    const matched = matches[0];
    return {
      content: replaceRuntimeTextAt(content, matched.startIndex, matched.candidate, newString),
      occurrences: 1,
      strategy: strategy.name,
    };
  }
  throw new BadRequestException(
    [
      'edit.oldString 未在文件中找到。',
      '请重新读取当前文件，确保 oldString 与文件中的文本一致。',
      '如果目标片段重复出现，请补更多上下文，至少包含前后几行稳定锚点。',
    ].join(' '),
  );
}

function countRuntimeTextOccurrences(content: string, target: string): number {
  if (!target.length) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (index <= content.length) {
    const matchedIndex = content.indexOf(target, index);
    if (matchedIndex < 0) {
      break;
    }
    count += 1;
    index = matchedIndex + target.length;
  }
  return count;
}

function readRuntimeTextExactMatches(content: string, target: string): RuntimeTextReplaceMatch[] {
  if (!target.length) {
    return [];
  }
  const matches: RuntimeTextReplaceMatch[] = [];
  let searchIndex = 0;
  while (searchIndex <= content.length) {
    const startIndex = content.indexOf(target, searchIndex);
    if (startIndex < 0) {
      break;
    }
    matches.push({
      candidate: target,
      line: readRuntimeTextLineFromIndex(content, startIndex),
      startIndex,
    });
    searchIndex = startIndex + target.length;
  }
  return matches;
}

function replaceRuntimeTextAt(
  content: string,
  startIndex: number,
  oldString: string,
  newString: string,
): string {
  return `${content.slice(0, startIndex)}${newString}${content.slice(startIndex + oldString.length)}`;
}

function readLineTrimmedCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const matches: RuntimeTextReplaceMatch[] = [];
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < findLines.length; offset += 1) {
      if (sourceLines[index + offset].trim() !== findLines[offset].trim()) {
        matched = false;
        break;
      }
    }
    if (!matched) {
      continue;
    }
    const candidate = restoreTrailingNewline(
      sourceLines.slice(index, index + findLines.length).join('\n'),
      find,
    );
    matches.push({
      candidate,
      line: index + 1,
      startIndex: readRuntimeTextLineStartIndex(sourceLines, index),
    });
  }
  return matches;
}

function readWhitespaceNormalizedCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
  const normalizedFind = normalizeWhitespace(find);
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const matches: RuntimeTextReplaceMatch[] = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    if (normalizeWhitespace(line) === normalizedFind) {
      matches.push({
        candidate: line,
        line: index + 1,
        startIndex: readRuntimeTextLineStartIndex(sourceLines, index),
      });
    }
  }
  if (findLines.length <= 1) {
    return matches;
  }
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (normalizeWhitespace(block) === normalizedFind) {
      matches.push({
        candidate: restoreTrailingNewline(block, find),
        line: index + 1,
        startIndex: readRuntimeTextLineStartIndex(sourceLines, index),
      });
    }
  }
  return matches;
}

function readIndentationFlexibleCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const normalizeIndentation = (value: string) => {
    const lines = value.split('\n');
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length === 0) {
      return value;
    }
    const indentation = Math.min(
      ...nonEmptyLines.map((line) => {
        const matched = line.match(/^(\s*)/);
        return matched ? matched[1].length : 0;
      }),
    );
    return lines
      .map((line) => (line.trim().length === 0 ? line : line.slice(indentation)))
      .join('\n');
  };
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const normalizedFind = normalizeIndentation(findLines.join('\n'));
  const matches: RuntimeTextReplaceMatch[] = [];
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (normalizeIndentation(block) === normalizedFind) {
      matches.push({
        candidate: restoreTrailingNewline(block, find),
        line: index + 1,
        startIndex: readRuntimeTextLineStartIndex(sourceLines, index),
      });
    }
  }
  return matches;
}

function readTrimmedBoundaryCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const trimmed = find.trim();
  if (trimmed === find) {
    return [];
  }
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const matches: RuntimeTextReplaceMatch[] = [];
  matches.push(...readRuntimeTextExactMatches(content, trimmed));
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (block.trim() === trimmed) {
      matches.push({
        candidate: restoreTrailingNewline(block, find),
        line: index + 1,
        startIndex: readRuntimeTextLineStartIndex(sourceLines, index),
      });
    }
  }
  return matches;
}

function readBlockAnchorCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  if (findLines.length < 3) {
    return [];
  }
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();
  const matches: RuntimeTextReplaceMatch[] = [];
  for (let start = 0; start < sourceLines.length; start += 1) {
    if (sourceLines[start].trim() !== firstLine) {
      continue;
    }
    for (let end = start + 2; end < sourceLines.length; end += 1) {
      if (sourceLines[end].trim() !== lastLine) {
        continue;
      }
      const block = sourceLines.slice(start, end + 1).join('\n');
      const similarity = readRuntimeTextBlockSimilarity(
        sourceLines.slice(start, end + 1),
        findLines,
      );
      if (similarity < 0.5) {
        continue;
      }
      matches.push({
        candidate: restoreTrailingNewline(block, find),
        line: start + 1,
        startIndex: readRuntimeTextLineStartIndex(sourceLines, start),
      });
      break;
    }
  }
  return matches;
}

function readContextAwareCandidates(content: string, find: string): RuntimeTextReplaceMatch[] {
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  if (findLines.length < 3) {
    return [];
  }
  const firstLine = findLines[0].trim();
  const lastLine = findLines[findLines.length - 1].trim();
  const matches: RuntimeTextReplaceMatch[] = [];
  for (let start = 0; start < sourceLines.length; start += 1) {
    if (sourceLines[start].trim() !== firstLine) {
      continue;
    }
    const expectedLength = findLines.length;
    const blockLines = sourceLines.slice(start, start + expectedLength);
    if (blockLines.length !== expectedLength) {
      continue;
    }
    if (blockLines[blockLines.length - 1].trim() !== lastLine) {
      continue;
    }
    const similarity = readRuntimeTextMiddleLineSimilarity(blockLines, findLines);
    if (similarity < 0.5) {
      continue;
    }
    matches.push({
      candidate: restoreTrailingNewline(blockLines.join('\n'), find),
      line: start + 1,
      startIndex: readRuntimeTextLineStartIndex(sourceLines, start),
    });
  }
  return matches;
}

function dedupeRuntimeTextMatches(matches: RuntimeTextReplaceMatch[]): RuntimeTextReplaceMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    if (!match.candidate.length || match.startIndex < 0) {
      return false;
    }
    const key = `${match.startIndex}:${match.candidate}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readRuntimeTextLineStartIndex(lines: string[], lineIndex: number): number {
  let startIndex = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    startIndex += lines[index].length + 1;
  }
  return startIndex;
}

function readRuntimeTextLineFromIndex(content: string, startIndex: number): number {
  if (startIndex <= 0) {
    return 1;
  }
  return content.slice(0, startIndex).split('\n').length;
}

function readRuntimeTextAmbiguousMessage(
  strategy: RuntimeTextReplaceStrategy,
  matches: RuntimeTextReplaceMatch[],
  replaceAll: boolean,
): string {
  const lines = matches
    .slice(0, 5)
    .map((match) => `第 ${match.line} 行`)
    .join('、');
  return [
    `edit.oldString 按 ${strategy} 策略匹配到多个位置。`,
    `当前命中 ${matches.length} 处：${lines}${matches.length > 5 ? ' 等' : ''}。`,
    replaceAll
      ? 'replaceAll 只允许同一段文本的全量替换；请补更多上下文，让匹配先收敛到同一段原文。'
      : '请补更多上下文，缩小到唯一位置，或者在确认它们是同一段原文后再使用 replaceAll。',
  ].join(' ');
}

function readRuntimeTextBlockSimilarity(blockLines: string[], findLines: string[]): number {
  const middleCount = Math.min(blockLines.length, findLines.length) - 2;
  if (middleCount <= 0) {
    return 1;
  }
  let score = 0;
  for (let offset = 1; offset <= middleCount; offset += 1) {
    const source = blockLines[offset].trim();
    const target = findLines[offset].trim();
    const maxLength = Math.max(source.length, target.length);
    if (maxLength === 0) {
      score += 1;
      continue;
    }
    score += 1 - readRuntimeTextLevenshtein(source, target) / maxLength;
  }
  return score / middleCount;
}

function readRuntimeTextMiddleLineSimilarity(blockLines: string[], findLines: string[]): number {
  let matched = 0;
  let total = 0;
  for (let offset = 1; offset < blockLines.length - 1; offset += 1) {
    const source = blockLines[offset].trim();
    const target = findLines[offset].trim();
    if (!source.length && !target.length) {
      continue;
    }
    total += 1;
    if (source === target) {
      matched += 1;
    }
  }
  return total === 0 ? 1 : matched / total;
}

function readRuntimeTextLevenshtein(left: string, right: string): number {
  if (!left.length || !right.length) {
    return Math.max(left.length, right.length);
  }
  const matrix = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) => (
      row === 0 ? column : column === 0 ? row : 0
    )),
  );
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

function restoreTrailingNewline(block: string, find: string): string {
  return find.endsWith('\n') ? `${block}\n` : block;
}

function trimTrailingEmptyLine(lines: string[]): string[] {
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    return lines.slice(0, -1);
  }
  return lines;
}

const runtimeTextReplaceStrategies: Array<{
  name: RuntimeTextReplaceStrategy;
  read(content: string, find: string): RuntimeTextReplaceMatch[];
}> = [
  {
    name: 'exact',
    read(content, find) {
      return readRuntimeTextExactMatches(content, find);
    },
  },
  {
    name: 'trimmed-boundary',
    read: readTrimmedBoundaryCandidates,
  },
  {
    name: 'indentation-flexible',
    read: readIndentationFlexibleCandidates,
  },
  {
    name: 'context-aware',
    read: readContextAwareCandidates,
  },
  {
    name: 'block-anchor',
    read: readBlockAnchorCandidates,
  },
  {
    name: 'line-trimmed',
    read: readLineTrimmedCandidates,
  },
  {
    name: 'whitespace-normalized',
    read: readWhitespaceNormalizedCandidates,
  },
];
