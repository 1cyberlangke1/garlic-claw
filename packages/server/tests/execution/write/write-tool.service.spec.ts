import { WriteToolService } from '../../../src/execution/write/write-tool.service';

describe('WriteToolService', () => {
  it('formats write metadata for the model', async () => {
    const service = new WriteToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        writeTextFile: jest.fn().mockResolvedValue({
          created: true,
          lineCount: 3,
          path: '/docs/output.txt',
          size: 2048,
        }),
      } as never,
    );

    await expect(service.execute({
      content: 'one\ntwo\nthree\n',
      filePath: 'docs/output.txt',
      sessionId: 'session-1',
    })).resolves.toEqual({
      created: true,
      lineCount: 3,
      output: [
        '<write_result>',
        'Path: /docs/output.txt',
        'Status: created',
        'Lines: 3',
        'Size: 2.0 KB',
        '</write_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      size: 2048,
    });
  });
});
