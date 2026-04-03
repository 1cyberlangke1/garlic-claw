import {
  readJsonObjectValue,
  readPluginChatMessageParts,
  readPluginLlmMessages,
} from './plugin-llm-payload.helpers';

describe('plugin-llm-payload.helpers', () => {
  it('reads llm messages with text and image parts', () => {
    expect(
      readPluginLlmMessages(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'hello',
              },
              {
                type: 'image',
                image: 'data:image/png;base64,abc',
                mimeType: 'image/png',
              },
            ],
          },
          {
            role: 'assistant',
            content: 'done',
          },
        ],
        {
          arrayLabel: 'messages',
        },
      ),
    ).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'hello',
          },
          {
            type: 'image',
            image: 'data:image/png;base64,abc',
            mimeType: 'image/png',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'done',
      },
    ]);
  });

  it('uses custom item labels when reading chat message parts', () => {
    expect(
      readPluginChatMessageParts(
        [
          {
            type: 'text',
            text: 'hello',
          },
        ],
        {
          arrayLabel: 'llm.generate 的 parts',
          itemLabelPrefix: 'llm.generate.parts',
        },
      ),
    ).toEqual([
      {
        type: 'text',
        text: 'hello',
      },
    ]);
  });

  it('throws indexed labels for invalid llm message roles', () => {
    expect(() =>
      readPluginLlmMessages(
        [
          {
            role: 'bot',
            content: 'hello',
          },
        ],
        {
          arrayLabel: 'messages',
        },
      ),
    ).toThrow('messages[0].role 必须是 user/assistant/system/tool');
  });

  it('rejects non-object json values', () => {
    expect(() => readJsonObjectValue([], 'payload')).toThrow(
      'payload 必须是对象',
    );
  });
});
