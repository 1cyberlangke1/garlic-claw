import { renderRuntimeFilesystemPostWriteLines } from '../../../src/execution/file/runtime-file-post-write-report';

describe('renderRuntimeFilesystemPostWriteLines', () => {
  it('groups diagnostics by file and keeps related file diagnostics visible', () => {
    expect(renderRuntimeFilesystemPostWriteLines({
      diagnostics: [
        {
          column: 10,
          line: 1,
          message: 'Current file issue',
          path: '/src/a.ts',
          severity: 'error',
          source: 'typescript',
        },
        {
          column: 3,
          line: 2,
          message: 'Related file issue',
          path: '/src/b.ts',
          severity: 'warning',
          source: 'typescript',
        },
      ],
      formatting: null,
    })).toEqual([
      'Diagnostics: 2 issue(s) across 2 file(s)',
      [
        '<diagnostics file="/src/a.ts">',
        'ERROR [1:10] Current file issue',
        '</diagnostics>',
      ].join('\n'),
      [
        '<diagnostics file="/src/b.ts">',
        'WARNING [2:3] Related file issue',
        '</diagnostics>',
      ].join('\n'),
    ]);
  });
});
