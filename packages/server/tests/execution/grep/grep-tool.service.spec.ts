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
          totalMatches: 1,
          truncated: false,
        }),
      } as never,
    );

    await expect(service.execute({
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
        '(some files were skipped during search)',
        '</matches>',
        '</grep_result>',
      ].join('\n'),
      truncated: false,
    });
  });
});
