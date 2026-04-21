import { ReadToolService } from '../../../src/execution/read/read-tool.service';

describe('ReadToolService', () => {
  it('formats directory windows with continuation hints', async () => {
    const service = new ReadToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          entries: ['a.txt', 'b.txt'],
          limit: 2,
          offset: 3,
          path: '/docs',
          totalEntries: 6,
          truncated: true,
          type: 'directory',
        }),
      } as never,
    );

    await expect(service.execute({
      filePath: 'docs',
      limit: 2,
      offset: 3,
      sessionId: 'session-1',
    })).resolves.toEqual({
      output: [
        '<read_result>',
        'Path: /docs',
        'Type: directory',
        '<entries>',
        'a.txt',
        'b.txt',
        '(showing entries 3-4 of 6. Use offset=5 to continue.)',
        '</entries>',
        '</read_result>',
      ].join('\n'),
      path: '/docs',
      truncated: true,
      type: 'directory',
    });
  });

  it('formats byte-limited file reads with explicit continuation hints', async () => {
    const service = new ReadToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: true,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 4,
          path: '/docs/readme.txt',
          totalBytes: 80960,
          totalLines: 400,
          truncated: true,
          type: 'file',
        }),
      } as never,
    );

    await expect(service.execute({
      filePath: 'docs/readme.txt',
      limit: 2,
      offset: 4,
      sessionId: 'session-1',
    })).resolves.toEqual({
      output: [
        '<read_result>',
        'Path: /docs/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '4: alpha',
        '5: beta',
        '(output capped at 50 KB. Showing lines 4-5. Use offset=6 to continue.)',
        '</content>',
        '</read_result>',
      ].join('\n'),
      path: '/docs/readme.txt',
      truncated: true,
      type: 'file',
    });
  });

  it('formats image reads as non-text assets', async () => {
    const service = new ReadToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          mimeType: 'image/png',
          path: '/docs/chart.png',
          size: 4096,
          type: 'image',
        }),
      } as never,
    );

    await expect(service.execute({
      filePath: 'docs/chart.png',
      sessionId: 'session-1',
    })).resolves.toEqual({
      output: [
        '<read_result>',
        'Path: /docs/chart.png',
        'Type: image',
        'Mime: image/png',
        'Size: 4.0 KB',
        'Image file detected. Text content was not expanded.',
        '</read_result>',
      ].join('\n'),
      path: '/docs/chart.png',
      truncated: false,
      type: 'image',
    });
  });
});
