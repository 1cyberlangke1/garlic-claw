import { GrepToolService } from '../../../src/execution/grep/grep-tool.service';

describe('GrepToolService', () => {
  it('formats partial search output for the model', async () => {
    const service = new GrepToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          matches: [
            {
              line: 7,
              text: 'needle here',
              virtualPath: '/docs/readme.md',
            },
          ],
          partial: true,
          skippedEntries: [
            {
              path: '/docs/private.md',
              reason: 'unreadable',
            },
            {
              path: '/docs/image.png',
              reason: 'binary',
            },
          ],
          skippedPaths: ['/docs/private.md'],
          totalMatches: 1,
          truncated: false,
        }),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 1,
      output: [
        '<grep_result>',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '/docs/readme.md:',
        '  7: needle here',
        '(total matches: 1)',
        '(non-text files were skipped during search: /docs/image.png)',
        '(search may be incomplete; some paths could not be searched: /docs/private.md)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('formats truncated grep results with visible totals', async () => {
    const service = new GrepToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        grepText: jest.fn().mockResolvedValue({
          matches: [
            {
              line: 3,
              text: 'needle one',
              virtualPath: '/docs/a.md',
            },
            {
              line: 8,
              text: 'needle two',
              virtualPath: '/docs/b.md',
            },
          ],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 140,
          truncated: true,
        }),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      include: '**/*.md',
      path: 'docs',
      pattern: 'needle',
      sessionId: 'session-1',
    })).resolves.toEqual({
      matches: 140,
      output: [
        '<grep_result>',
        'Pattern: needle',
        'Include: **/*.md',
        '<matches>',
        '/docs/a.md:',
        '  3: needle one',
        '/docs/b.md:',
        '  8: needle two',
        '(showing first 2 of 140 matches. Refine path, include or pattern to continue.)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: true,
    });
  });
});
