import { GlobToolService } from '../../../src/execution/glob/glob-tool.service';

describe('GlobToolService', () => {
  it('formats empty glob results with explicit totals', async () => {
    const service = new GlobToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: [],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 0,
          truncated: false,
        }),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: '**/*.md',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 0,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Pattern: **/*.md',
        '<matches>',
        '(no matches)',
        '(total matches: 0)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: false,
    });
  });

  it('formats truncated glob results with visible totals', async () => {
    const service = new GlobToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: ['/docs/a.ts', '/docs/b.ts'],
          partial: false,
          skippedEntries: [],
          skippedPaths: [],
          totalMatches: 120,
          truncated: true,
        }),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: '**/*.ts',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 120,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Pattern: **/*.ts',
        '<matches>',
        '/docs/a.ts',
        '/docs/b.ts',
        '(showing first 2 of 120 matches, 118 hidden. Refine path or pattern to continue.)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: true,
    });
  });

  it('formats partial glob output with skipped paths', async () => {
    const service = new GlobToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        globPaths: jest.fn().mockResolvedValue({
          basePath: '/docs',
          matches: ['/docs/a.ts'],
          partial: true,
          skippedEntries: [
            {
              path: '/docs/private',
              reason: 'inaccessible',
            },
          ],
          skippedPaths: ['/docs/private'],
          totalMatches: 1,
          truncated: false,
        }),
      } as never,
    );

    await expect(service.execute({
      backendKind: 'host-filesystem',
      path: 'docs',
      pattern: '**/*.ts',
      sessionId: 'session-1',
    })).resolves.toEqual({
      count: 1,
      output: [
        '<glob_result>',
        'Base: /docs',
        'Pattern: **/*.ts',
        '<matches>',
        '/docs/a.ts',
        '(total matches: 1)',
        '(search may be incomplete; inaccessible paths were skipped: /docs/private)',
        '</matches>',
        '</glob_result>',
      ].join('\n'),
      truncated: false,
    });
  });
});
