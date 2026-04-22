import { replaceRuntimeText } from '../../../src/execution/file/runtime-text-replace';

describe('replaceRuntimeText', () => {
  it('supports exact strategy', () => {
    expect(replaceRuntimeText('alpha beta', 'alpha', 'gamma')).toEqual({
      content: 'gamma beta',
      occurrences: 1,
      strategy: 'exact',
    });
  });

  it('supports block-anchor strategy on multi-line edits with stable anchors', () => {
    expect(replaceRuntimeText(
      'if (true) {\n  console.log("alpha");\n  console.log("tail");\n}\n',
      'if (true) {\nconsole.log("alpha");\n}\n',
      'if (true) {\n    console.log("beta");\n}\n',
    )).toEqual({
      content: 'if (true) {\n    console.log("beta");\n}\n',
      occurrences: 1,
      strategy: 'block-anchor',
    });
  });

  it('supports whitespace-normalized strategy', () => {
    expect(replaceRuntimeText(
      'const value = 1;\n',
      'const   value   =   1;',
      'const value = 2;',
    )).toEqual({
      content: 'const value = 2;\n',
      occurrences: 1,
      strategy: 'whitespace-normalized',
    });
  });

  it('supports indentation-flexible strategy', () => {
    expect(replaceRuntimeText(
      'function demo() {\n    if (true) {\n      return 1;\n    }\n}\n',
      'if (true) {\n  return 1;\n}\n',
      'if (true) {\n  return 2;\n}\n',
    )).toEqual({
      content: 'function demo() {\nif (true) {\n  return 2;\n}\n}\n',
      occurrences: 1,
      strategy: 'indentation-flexible',
    });
  });

  it('supports trimmed-boundary strategy', () => {
    expect(replaceRuntimeText(
      'const value = 1;\n',
      '  const value = 1;  ',
      'const value = 2;',
    )).toEqual({
      content: 'const value = 2;\n',
      occurrences: 1,
      strategy: 'trimmed-boundary',
    });
  });

  it('rejects ambiguous trimmed-boundary matches instead of silently editing the first one', () => {
    expect(() => replaceRuntimeText(
      'alpha middle alpha\n',
      '  alpha  ',
      'beta',
    )).toThrow('trimmed-boundary');
    expect(() => replaceRuntimeText(
      'alpha middle alpha\n',
      '  alpha  ',
      'beta',
    )).toThrow('第 1 行');
  });

  it('rejects ambiguous exact matches instead of falling through to looser strategies', () => {
    expect(() => replaceRuntimeText(
      'foo\n foo \n',
      'foo',
      'bar',
    )).toThrow('第 1 行');
    expect(() => replaceRuntimeText(
      'foo\n foo \n',
      'foo',
      'bar',
    )).toThrow('第 2 行');
  });

  it('supports replaceAll on a strict exact match set', () => {
    expect(replaceRuntimeText(
      'alpha\nalpha\n',
      'alpha',
      'beta',
      true,
    )).toEqual({
      content: 'beta\nbeta\n',
      occurrences: 2,
      strategy: 'exact',
    });
  });

  it('rejects replaceAll when a loose strategy points to different candidate texts', () => {
    expect(() => replaceRuntimeText(
      'value\n\tvalue\t\n',
      ' value ',
      'beta',
      true,
    )).toThrow('replaceAll 只允许同一段文本的全量替换');
  });

  it('supports context-aware strategy when middle lines already match exactly', () => {
    expect(replaceRuntimeText(
      [
        'function run() {',
        '  const value = computeOldValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
      [
        'function run() {',
        'const value = computeOldValue();',
        'return value;',
        '}',
        '',
      ].join('\n'),
      [
        'function run() {',
        '  const value = computeNewValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
    )).toEqual({
      content: [
        'function run() {',
        '  const value = computeNewValue();',
        '  return value;',
        '}',
        '',
      ].join('\n'),
      occurrences: 1,
      strategy: 'context-aware',
    });
  });

  it('returns a more actionable not-found error', () => {
    expect(() => replaceRuntimeText(
      'const answer = 42;\n',
      'const answer = 7;\n',
      'const answer = 8;\n',
    )).toThrow('请重新读取当前文件');
  });
});
