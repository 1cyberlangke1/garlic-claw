import { normalizePluginManifestCandidate } from './plugin-manifest-normalize.helpers';

describe('plugin-manifest-normalize.helpers', () => {
  it('falls back to persisted metadata when manifest fields are absent or malformed', () => {
    expect(
      normalizePluginManifestCandidate(
        {
          name: '  ',
          version: '',
          runtime: 'broken',
          permissions: ['memory:read', 'bad'],
          tools: [
            {
              name: 'echo',
              description: '回显',
              parameters: {
                text: {
                  type: 'string',
                  required: true,
                },
              },
            },
          ],
        },
        {
          id: 'builtin.echo',
          displayName: 'Echo',
          description: 'fallback description',
          version: '1.0.0',
          runtimeKind: 'builtin',
        },
      ),
    ).toEqual({
      id: 'builtin.echo',
      name: 'Echo',
      description: 'fallback description',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['memory:read'],
      tools: [
        {
          name: 'echo',
          description: '回显',
          parameters: {
            text: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
      routes: [],
    });
  });
});
