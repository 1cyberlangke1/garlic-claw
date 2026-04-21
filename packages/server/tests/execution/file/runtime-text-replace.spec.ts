import { replaceRuntimeText } from '../../../src/execution/file/runtime-text-replace';

describe('replaceRuntimeText', () => {
  it('supports exact strategy', () => {
    expect(replaceRuntimeText('alpha beta', 'alpha', 'gamma')).toEqual({
      content: 'gamma beta',
      occurrences: 1,
      strategy: 'exact',
    });
  });

  it('supports line-trimmed strategy', () => {
    expect(replaceRuntimeText(
      'if (true) {\n  console.log("alpha");\n}\n',
      'if (true) {\nconsole.log("alpha");\n}\n',
      'if (true) {\n    console.log("beta");\n}\n',
    )).toEqual({
      content: 'if (true) {\n    console.log("beta");\n}\n',
      occurrences: 1,
      strategy: 'line-trimmed',
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

  it('rejects ambiguous exact matches instead of falling through to looser strategies', () => {
    expect(() => replaceRuntimeText(
      'foo\n foo \n',
      'foo',
      'bar',
    )).toThrow('edit.oldString 匹配到多个位置');
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
});
