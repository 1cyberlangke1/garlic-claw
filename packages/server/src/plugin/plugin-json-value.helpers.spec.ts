import {
  readOptionalBooleanValue,
  readOptionalNumberValue,
  readOptionalObjectValue,
  readOptionalStringArrayValue,
  readOptionalStringRecordValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';

describe('plugin-json-value.helpers', () => {
  it('reads optional primitive values', () => {
    expect(readOptionalStringValue('hello', 'field')).toBe('hello');
    expect(readOptionalBooleanValue(true, 'flag')).toBe(true);
    expect(readOptionalNumberValue(3, 'count')).toBe(3);
  });

  it('returns undefined for missing optional values', () => {
    expect(readOptionalStringValue(undefined, 'field')).toBeUndefined();
    expect(readOptionalObjectValue(null, 'object')).toBeUndefined();
    expect(readOptionalStringArrayValue(undefined, 'list')).toBeUndefined();
    expect(readOptionalStringRecordValue(undefined, 'headers')).toBeUndefined();
  });

  it('reads optional object, array and record values', () => {
    expect(readOptionalObjectValue({ ok: true }, 'object')).toEqual({ ok: true });
    expect(readOptionalStringArrayValue(['a', 'b'], 'list')).toEqual(['a', 'b']);
    expect(
      readOptionalStringRecordValue(
        {
          Authorization: 'Bearer token',
        },
        'headers',
      ),
    ).toEqual({
      Authorization: 'Bearer token',
    });
  });

  it('throws readable labels for invalid values', () => {
    expect(() => readOptionalStringValue(1 as never, 'field')).toThrow(
      'field 必须是字符串',
    );
    expect(() => readOptionalBooleanValue('x' as never, 'flag')).toThrow(
      'flag 必须是布尔值',
    );
    expect(() => readOptionalNumberValue('x' as never, 'count')).toThrow(
      'count 必须是数字',
    );
    expect(() => readOptionalObjectValue([] as never, 'object')).toThrow(
      'object 必须是对象',
    );
    expect(() => readOptionalStringArrayValue([1] as never, 'list')).toThrow(
      'list 必须是字符串数组',
    );
    expect(
      () =>
        readOptionalStringRecordValue(
          {
            Authorization: 1,
          } as never,
          'headers',
        ),
    ).toThrow('headers.Authorization 必须是字符串');
  });
});
