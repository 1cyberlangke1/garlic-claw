import { ReadToolService } from '../../../src/execution/read/read-tool.service';

describe('ReadToolService', () => {
  it('formats directory windows with continuation hints', async () => {
    const freshness = {
      listRecentReads: jest.fn().mockReturnValue([]),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
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
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
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
    expect(freshness.rememberRead).not.toHaveBeenCalled();
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
      {
        listRecentReads: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
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
      {
        listRecentReads: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
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

  it('formats pdf reads as non-text assets', async () => {
    const service = new ReadToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          mimeType: 'application/pdf',
          path: '/docs/guide.pdf',
          size: 6144,
          type: 'pdf',
        }),
      } as never,
      {
        listRecentReads: jest.fn().mockReturnValue([]),
        rememberRead: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/guide.pdf',
      sessionId: 'session-1',
    })).resolves.toEqual({
      output: [
        '<read_result>',
        'Path: /docs/guide.pdf',
        'Type: pdf',
        'Mime: application/pdf',
        'Size: 6.0 KB',
        'PDF file detected. Text content was not expanded.',
        '</read_result>',
      ].join('\n'),
      path: '/docs/guide.pdf',
      truncated: false,
      type: 'pdf',
    });
  });

  it('appends a session reminder with other recently read files', async () => {
    const freshness = {
      listRecentReads: jest.fn().mockReturnValue(['/docs/notes.txt', '/docs/todo.md']),
      rememberRead: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReadToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        readPathRange: jest.fn().mockResolvedValue({
          byteLimited: false,
          limit: 2,
          lines: ['alpha', 'beta'],
          mimeType: 'text/plain',
          offset: 1,
          path: '/docs/readme.txt',
          totalBytes: 11,
          totalLines: 2,
          truncated: false,
          type: 'file',
        }),
      } as never,
      freshness as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      filePath: 'docs/readme.txt',
      limit: 2,
      offset: 1,
      sessionId: 'session-1',
    })).resolves.toEqual({
      output: [
        '<read_result>',
        'Path: /docs/readme.txt',
        'Type: file',
        'Mime: text/plain',
        '<content>',
        '1: alpha',
        '2: beta',
        '(end of file, total lines: 2, total bytes: 11 B)',
        '</content>',
        '<system-reminder>',
        '本 session 近期还读取过这些文件：',
        '- /docs/notes.txt',
        '- /docs/todo.md',
        '如需跨文件继续修改，优先复用这些已读取内容；若文件可能已变化，请先重新 read。',
        '</system-reminder>',
        '</read_result>',
      ].join('\n'),
      path: '/docs/readme.txt',
      truncated: false,
      type: 'file',
    });
    expect(freshness.listRecentReads).toHaveBeenCalledWith('session-1', {
      excludePath: '/docs/readme.txt',
      limit: 5,
    });
  });
});
