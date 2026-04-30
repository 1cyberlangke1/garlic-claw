import { createTwoFilesPatch, diffLines } from 'diff';

export interface RuntimeFilesystemDiffSummary {
  additions: number;
  afterLineCount: number;
  beforeLineCount: number;
  deletions: number;
  patch: string;
}

export function buildRuntimeFilesystemDiff(
  filePath: string,
  beforeContent: string,
  afterContent: string,
): RuntimeFilesystemDiffSummary {
  const normalizedBefore = normalizeRuntimeDiffLineEndings(beforeContent);
  const normalizedAfter = normalizeRuntimeDiffLineEndings(afterContent);
  let additions = 0;
  let deletions = 0;
  for (const change of diffLines(normalizedBefore, normalizedAfter)) {
    if (change.added) {
      additions += change.count ?? 0;
      continue;
    }
    if (change.removed) {
      deletions += change.count ?? 0;
    }
  }
  return {
    additions,
    afterLineCount: countRuntimeDiffLines(afterContent),
    beforeLineCount: countRuntimeDiffLines(beforeContent),
    deletions,
    patch: trimRuntimeDiffPatch(createTwoFilesPatch(filePath, filePath, normalizedBefore, normalizedAfter)),
  };
}

function normalizeRuntimeDiffLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function trimRuntimeDiffPatch(patch: string): string {
  return patch.trim();
}

function countRuntimeDiffLines(content: string): number {
  if (!content.length) {
    return 0;
  }
  return content.endsWith('\n')
    ? content.slice(0, -1).split('\n').length
    : content.split('\n').length;
}
