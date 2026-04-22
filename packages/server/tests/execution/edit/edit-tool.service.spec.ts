import { BadRequestException } from '@nestjs/common';
import { EditToolService } from '../../../src/execution/edit/edit-tool.service';

describe('EditToolService', () => {
  it('formats edit strategy details for the model', async () => {
    const freshness = {
      assertCanWrite: jest.fn().mockResolvedValue(undefined),
      rememberRead: jest.fn().mockResolvedValue(undefined),
      withFileLock: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
        diff: {
          additions: 1,
          afterLineCount: 1,
          beforeLineCount: 1,
          deletions: 1,
          patch: 'mock patch',
        },
        occurrences: 1,
        path: '/docs/output.txt',
        postWrite: {
          diagnostics: [
            {
              column: 15,
              line: 1,
              message: 'Expression expected.',
              path: '/docs/output.txt',
              severity: 'error',
              source: 'typescript',
            },
          ],
          formatting: null,
        },
        strategy: 'whitespace-normalized',
      }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'beta',
      oldString: 'alpha',
      sessionId: 'session-1',
    })).resolves.toEqual({
      diff: {
        additions: 1,
        afterLineCount: 1,
        beforeLineCount: 1,
        deletions: 1,
        patch: 'mock patch',
      },
      occurrences: 1,
      output: [
        '<edit_result>',
        'Path: /docs/output.txt',
        'Occurrences: 1',
        'Mode: replace-one',
        'Strategy: whitespace-normalized',
        'Diff: +1 / -1',
        'Line delta: 1 -> 1',
        '<patch>',
        'mock patch',
        '</patch>',
        'Diagnostics: 1 issue(s)',
        '<diagnostics file="/docs/output.txt">',
        'ERROR [1:15] Expression expected.',
        '</diagnostics>',
        '</edit_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      postWrite: {
        diagnostics: [
          {
            column: 15,
            line: 1,
            message: 'Expression expected.',
            path: '/docs/output.txt',
            severity: 'error',
            source: 'typescript',
          },
        ],
        formatting: null,
      },
      strategy: 'whitespace-normalized',
    });
    expect(freshness.withFileLock).toHaveBeenCalledWith(
      'session-1',
      'docs/output.txt',
      expect.any(Function),
      'host-filesystem',
    );
    expect(freshness.assertCanWrite).toHaveBeenCalledWith('session-1', 'docs/output.txt', 'host-filesystem');
    expect(freshness.rememberRead).toHaveBeenCalledWith('session-1', '/docs/output.txt', 'host-filesystem');
  });

  it('keeps backend ambiguity errors visible to the caller', async () => {
    const freshness = {
      assertCanWrite: jest.fn().mockResolvedValue(undefined),
      rememberRead: jest.fn().mockResolvedValue(undefined),
      withFileLock: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
    };
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockRejectedValue(
          new BadRequestException('edit.oldString 按 trimmed-boundary 策略匹配到多个位置。 当前命中 2 处：第 1 行。'),
        ),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/output.txt',
      newString: 'beta',
      oldString: '  alpha  ',
      sessionId: 'session-1',
    })).rejects.toThrow('trimmed-boundary');
  });
});
