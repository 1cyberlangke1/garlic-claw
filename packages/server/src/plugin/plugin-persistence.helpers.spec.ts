import { BadRequestException } from '@nestjs/common';
import type { PluginManifest } from '@garlic-claw/shared';
import {
  parseNullablePluginJsonObject,
  parsePluginScope,
  parseStoredPluginJsonValue,
  resolvePluginConfig,
  validateAndNormalizePluginConfig,
  validatePluginScope,
} from './plugin-persistence.helpers';

describe('plugin-persistence.helpers', () => {
  const manifest: PluginManifest = {
    id: 'builtin.memory-context',
    name: '记忆上下文',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['config:read'],
    tools: [],
    hooks: [],
    routes: [],
    config: {
      fields: [
        {
          key: 'limit',
          type: 'number',
          required: true,
          defaultValue: 5,
        },
        {
          key: 'promptPrefix',
          type: 'string',
          defaultValue: '与此用户相关的记忆',
        },
      ],
    },
  };

  it('resolves config with defaults and falls back on invalid JSON', () => {
    const onWarn = jest.fn();

    expect(
      resolvePluginConfig({
        rawConfig: JSON.stringify({
          limit: 8,
        }),
        manifest,
      }),
    ).toEqual({
      limit: 8,
      promptPrefix: '与此用户相关的记忆',
    });

    expect(
      resolvePluginConfig({
        rawConfig: '{not-json',
        manifest,
        onWarn,
      }),
    ).toEqual({
      limit: 5,
      promptPrefix: '与此用户相关的记忆',
    });
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('plugin.jsonObject JSON 无效'),
    );
  });

  it('validates and normalizes config values', () => {
    expect(
      validateAndNormalizePluginConfig(manifest.config!, {
        limit: 10,
      }),
    ).toEqual({
      limit: 10,
    });

    expect(() =>
      validateAndNormalizePluginConfig(manifest.config!, {
        missing: true,
      }),
    ).toThrow(new BadRequestException('未知的插件配置项: missing'));

    expect(() =>
      validateAndNormalizePluginConfig(manifest.config!, {
        limit: 'oops' as never,
      }),
    ).toThrow(new BadRequestException('插件配置 limit 类型无效'));

    expect(() =>
      validateAndNormalizePluginConfig(
        {
          fields: [
            {
              key: 'requiredField',
              type: 'string',
              required: true,
            },
          ],
        },
        {},
      ),
    ).toThrow(new BadRequestException('插件配置 requiredField 必填'));
  });

  it('validates and normalizes plugin scope records', () => {
    expect(() =>
      validatePluginScope({
        defaultEnabled: true,
        conversations: {
          'conversation-1': true,
        },
      }),
    ).not.toThrow();

    expect(() =>
      validatePluginScope({
        defaultEnabled: 'yes' as never,
        conversations: {},
      }),
    ).toThrow(new BadRequestException('defaultEnabled 必须是布尔值'));

    expect(() =>
      validatePluginScope({
        defaultEnabled: true,
        conversations: {
          'conversation-1': 'yes' as never,
        },
      }),
    ).toThrow(new BadRequestException('conversation conversation-1 的启停值必须是布尔值'));

    expect(
      parsePluginScope({
        plugin: {
          name: 'builtin.core-tools',
          runtimeKind: 'builtin',
          defaultEnabled: false,
          conversationScopes: JSON.stringify({
            'conversation-1': false,
          }),
        },
      }),
    ).toEqual({
      defaultEnabled: true,
      conversations: {},
    });
  });

  it('parses persisted JSON values with fallback behavior', () => {
    const onWarn = jest.fn();

    expect(
      parseStoredPluginJsonValue({
        raw: JSON.stringify({
          enabled: true,
        }),
        fallback: null,
        label: 'pluginStorage:test',
      }),
    ).toEqual({
      enabled: true,
    });

    expect(
      parseStoredPluginJsonValue({
        raw: '{not-json',
        fallback: null,
        label: 'pluginStorage:test',
        onWarn,
      }),
    ).toBeNull();
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('pluginStorage:test JSON 无效'),
    );

    expect(
      parseNullablePluginJsonObject({
        raw: JSON.stringify(['not-object']),
        label: 'plugin.nullableJsonObject',
      }),
    ).toBeNull();
  });
});
