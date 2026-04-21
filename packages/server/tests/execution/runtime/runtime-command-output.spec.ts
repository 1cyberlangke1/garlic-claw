import { renderRuntimeCommandTextOutput } from '../../../src/execution/runtime/runtime-command-output';

describe('renderRuntimeCommandTextOutput', () => {
  it('renders empty stdout and stderr with stable bash result structure', () => {
    expect(renderRuntimeCommandTextOutput({
      cwd: '/',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout: '',
      stdoutStats: {
        bytes: 0,
        lines: 0,
      },
    })).toBe([
      '<bash_result>',
      'cwd: /',
      'exit_code: 0',
      '<stdout>',
      '(empty)',
      '</stdout>',
      '<stderr>',
      '(empty)',
      '</stderr>',
      '</bash_result>',
    ].join('\n'));
  });

  it('truncates oversized stream output to a bounded tail view', () => {
    const stdout = Array.from({ length: 260 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 260,
      },
    });

    expect(output).toContain('<bash_result>');
    expect(output).toContain('cwd: /tmp');
    expect(output).toContain('... output truncated (共 260 行，仅保留最后 200 行) ...');
    expect(output).toContain('line-61');
    expect(output).toContain('line-260');
    expect(output).not.toContain('line-1\n');
  });

  it('truncates oversized bytes without breaking the result wrapper', () => {
    const stdout = `prefix\n${'长'.repeat(10_000)}`;

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 7,
      stderr: 'warn',
      stderrStats: {
        bytes: 4,
        lines: 1,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 2,
      },
    });

    expect(output).toContain('exit_code: 7');
    expect(output).toContain(`... output truncated (共 ${Buffer.byteLength(stdout, 'utf8')} 字节，仅保留最后 16384 字节内的内容) ...`);
    expect(output).toContain('<stderr>\nwarn\n</stderr>');
  });

  it('supports custom truncation limits', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 8,
      },
    }, {
      maxLines: 3,
    });

    expect(output).toContain('... output truncated (共 8 行，仅保留最后 3 行) ...');
    expect(output).toContain('line-6');
    expect(output).toContain('line-8');
    expect(output).not.toContain('line-5\n');
  });

  it('can hide truncation details while still returning the bounded tail', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line-${index + 1}`).join('\n');

    const output = renderRuntimeCommandTextOutput({
      cwd: '/tmp',
      exitCode: 0,
      stderr: '',
      stderrStats: {
        bytes: 0,
        lines: 0,
      },
      stdout,
      stdoutStats: {
        bytes: Buffer.byteLength(stdout, 'utf8'),
        lines: 8,
      },
    }, {
      maxLines: 2,
      showTruncationDetails: false,
    });

    expect(output).not.toContain('output truncated');
    expect(output).toContain('<stdout>\nline-7\nline-8\n</stdout>');
  });
});
