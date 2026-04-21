import { BadRequestException } from '@nestjs/common';

export type RuntimeTextReplaceStrategy =
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
    const candidates = Array.from(new Set(strategy.read(content, oldString))).filter((candidate) => candidate.length > 0);
    if (candidates.length === 0) {
      continue;
    }
    const matchedCandidates = candidates
      .map((candidate) => ({
        candidate,
        occurrences: countRuntimeTextOccurrences(content, candidate),
      }))
      .filter((entry) => entry.occurrences > 0);
    if (matchedCandidates.length === 0) {
      continue;
    }
    if (replaceAll) {
      if (matchedCandidates.length > 1) {
        throw new BadRequestException('edit.oldString 匹配到多个位置，请补更多上下文或关闭 replaceAll');
      }
      const matched = matchedCandidates[0];
      return {
        content: content.split(matched.candidate).join(newString),
        occurrences: matched.occurrences,
        strategy: strategy.name,
      };
    }
    if (matchedCandidates.length > 1 || matchedCandidates[0].occurrences > 1) {
      throw new BadRequestException('edit.oldString 匹配到多个位置，请补更多上下文或使用 replaceAll');
    }
    const matched = matchedCandidates[0];
    return {
      content: replaceRuntimeTextFirst(content, matched.candidate, newString),
      occurrences: matched.occurrences,
      strategy: strategy.name,
    };
  }
  throw new BadRequestException('edit.oldString 未在文件中找到');
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

function replaceRuntimeTextFirst(content: string, oldString: string, newString: string): string {
  const matchedIndex = content.indexOf(oldString);
  if (matchedIndex < 0) {
    return content;
  }
  return `${content.slice(0, matchedIndex)}${newString}${content.slice(matchedIndex + oldString.length)}`;
}

function readLineTrimmedCandidates(content: string, find: string): string[] {
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const candidates: string[] = [];
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
    candidates.push(restoreTrailingNewline(
      sourceLines.slice(index, index + findLines.length).join('\n'),
      find,
    ));
  }
  return candidates;
}

function readWhitespaceNormalizedCandidates(content: string, find: string): string[] {
  const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();
  const normalizedFind = normalizeWhitespace(find);
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const candidates: string[] = [];
  for (const line of sourceLines) {
    if (normalizeWhitespace(line) === normalizedFind) {
      candidates.push(line);
    }
  }
  if (findLines.length <= 1) {
    return candidates;
  }
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (normalizeWhitespace(block) === normalizedFind) {
      candidates.push(restoreTrailingNewline(block, find));
    }
  }
  return candidates;
}

function readIndentationFlexibleCandidates(content: string, find: string): string[] {
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
  const candidates: string[] = [];
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (normalizeIndentation(block) === normalizedFind) {
      candidates.push(restoreTrailingNewline(block, find));
    }
  }
  return candidates;
}

function readTrimmedBoundaryCandidates(content: string, find: string): string[] {
  const trimmed = find.trim();
  if (trimmed === find) {
    return [];
  }
  const sourceLines = content.split('\n');
  const findLines = trimTrailingEmptyLine(find.split('\n'));
  const candidates: string[] = [];
  if (content.includes(trimmed)) {
    candidates.push(trimmed);
  }
  for (let index = 0; index <= sourceLines.length - findLines.length; index += 1) {
    const block = sourceLines.slice(index, index + findLines.length).join('\n');
    if (block.trim() === trimmed) {
      candidates.push(restoreTrailingNewline(block, find));
    }
  }
  return candidates;
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
  read(content: string, find: string): string[];
}> = [
  {
    name: 'exact',
    read(content, find) {
      return content.includes(find) ? [find] : [];
    },
  },
  {
    name: 'line-trimmed',
    read: readLineTrimmedCandidates,
  },
  {
    name: 'whitespace-normalized',
    read: readWhitespaceNormalizedCandidates,
  },
  {
    name: 'indentation-flexible',
    read: readIndentationFlexibleCandidates,
  },
  {
    name: 'trimmed-boundary',
    read: readTrimmedBoundaryCandidates,
  },
];
