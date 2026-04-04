import {
  detectMessageKind,
  getMessageReceivedText,
  getPluginHookPriority,
  matchesHookFilter,
} from '@garlic-claw/shared';

describe('plugin-runtime-hook-filter.helpers', () => {
  it('normalizes hook priority', () => {
    expect(getPluginHookPriority({ name: 'message:received' } as never)).toBe(0);
    expect(getPluginHookPriority({ name: 'message:received', priority: 4.8 } as never)).toBe(4);
  });

  it('extracts received text and detects message kind', () => {
    const message = {
      content: null,
      parts: [
        { type: 'text', text: 'hello' },
        { type: 'image', image: 'data:image/png;base64,abc' },
      ],
    };
    const payload = {
      message,
    } as never;

    expect(getMessageReceivedText(payload)).toBe('hello');
    expect(detectMessageKind(message as never)).toBe('mixed');
  });

  it('matches message received hook filters', () => {
    const payload = {
      message: {
        content: '/demo run',
        parts: [{ type: 'text', text: '/demo run' }],
      },
    } as never;

    expect(
      matchesHookFilter(
        {
          name: 'message:received',
          filter: {
            message: {
              commands: ['/demo'],
              regex: '^/demo',
              messageKinds: ['text'],
            },
          },
        } as never,
        'message:received',
        payload,
      ),
    ).toBe(true);

    expect(
      matchesHookFilter(
        {
          name: 'message:received',
          filter: {
            message: {
              commands: ['/other'],
            },
          },
        } as never,
        'message:received',
        payload,
      ),
    ).toBe(false);
  });
});
