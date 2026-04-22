import { WriteToolService } from '../../../src/execution/write/write-tool.service';

describe('WriteToolService', () => {
  it('formats write metadata for the model', async () => {
    const freshness = {
      assertCanWrite: jest.fn().mockResolvedValue(undefined),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WriteToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        writeTextFile: jest.fn().mockResolvedValue({
          created: true,
        diff: {
          additions: 3,
          afterLineCount: 3,
          beforeLineCount: 0,
          deletions: 0,
          patch: 'mock patch',
        },
        lineCount: 3,
        path: '/docs/output.txt',
        postWrite: {
          diagnostics: [],
          formatting: {
            kind: 'json-pretty',
            label: 'json-pretty',
          },
        },
        size: 2048,
      }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      content: 'one\ntwo\nthree\n',
      filePath: 'docs/output.txt',
      sessionId: 'session-1',
    })).resolves.toEqual({
      created: true,
      diff: {
        additions: 3,
        afterLineCount: 3,
        beforeLineCount: 0,
        deletions: 0,
        patch: 'mock patch',
      },
      lineCount: 3,
      output: [
        '<write_result>',
        'Path: /docs/output.txt',
        'Status: created',
        'Lines: 3',
        'Size: 2.0 KB',
        'Diff: +3 / -0',
        'Line delta: 0 -> 3',
        '<patch>',
        'mock patch',
        '</patch>',
        'Formatting: json-pretty',
        'Diagnostics: none',
        '</write_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      postWrite: {
        diagnostics: [],
        formatting: {
          kind: 'json-pretty',
          label: 'json-pretty',
        },
      },
      size: 2048,
    });
    expect(freshness.assertCanWrite).toHaveBeenCalledWith('session-1', 'docs/output.txt', 'host-filesystem');
    expect(freshness.rememberRead).toHaveBeenCalledWith('session-1', '/docs/output.txt', 'host-filesystem');
  });
});
