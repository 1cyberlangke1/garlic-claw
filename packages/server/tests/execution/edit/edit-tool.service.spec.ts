import { EditToolService } from '../../../src/execution/edit/edit-tool.service';

describe('EditToolService', () => {
  it('formats edit strategy details for the model', async () => {
    const service = new EditToolService(
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        editTextFile: jest.fn().mockResolvedValue({
          occurrences: 1,
          path: '/docs/output.txt',
          strategy: 'whitespace-normalized',
        }),
      } as never,
    );

    await expect(service.execute({
      filePath: 'docs/output.txt',
      newString: 'beta',
      oldString: 'alpha',
      sessionId: 'session-1',
    })).resolves.toEqual({
      occurrences: 1,
      output: [
        '<edit_result>',
        'Path: /docs/output.txt',
        'Occurrences: 1',
        'Mode: replace-one',
        'Strategy: whitespace-normalized',
        '</edit_result>',
      ].join('\n'),
      path: '/docs/output.txt',
      strategy: 'whitespace-normalized',
    });
  });
});
