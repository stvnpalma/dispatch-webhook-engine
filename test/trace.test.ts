import { buildTraceAttributes, parseTraceId } from '../lambda/shared/trace';

describe('parseTraceId', () => {
  test('extracts the root trace ID from a full X-Ray header', () => {
    const header =
      'Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1';
    expect(parseTraceId(header)).toBe('1-5759e988-bd862e3fe1be46a994272793');
  });

  test('returns undefined if the header is undefined', () => {
    expect(parseTraceId(undefined)).toBeUndefined();
  });

  test('returns undefined if the header does not contain a Root part', () => {
    const header = 'Parent=53995c3f42cd8ad8;Sampled=1';
    expect(parseTraceId(header)).toBeUndefined();
  });

  test('returns the Root value when it is the only field in the header', () => {
    const header = 'Root=1-5759e988-bd862e3fe1be46a994272793';
    expect(parseTraceId(header)).toBe('1-5759e988-bd862e3fe1be46a994272793');
  });

  test('returns undefined if Root has an empty value', () => {
    const header = 'Root=;Parent=53995c3f42cd8ad8';
    expect(parseTraceId(header)).toBeUndefined();
  });

  test('extracts Root when it is not the first field', () => {
    const header = 'Parent=53995c3f42cd8ad8;Root=1-aaaa-bbbb;Sampled=1';
    expect(parseTraceId(header)).toBe('1-aaaa-bbbb');
  });

  test('extracts Root when there is a space after the semicolon', () => {
    const header = 'Parent=x; Root=1-aaaa-bbbb';
    expect(parseTraceId(header)).toBe('1-aaaa-bbbb');
  });
});

describe('buildTraceAttributes', () => {
  test('returns trace attributes when valid header is provided', () => {
    const header = 'Root=1-aaaa-bbbb;Parent=x;Sampled=1';
    const result = buildTraceAttributes(header);
    expect(result).toEqual({
      MessageSystemAttributes: {
        AWSTraceHeader: {
          DataType: 'String',
          StringValue: header,
        },
      },
    });
  });

  test('returns empty object when header is undefined', () => {
    const result = buildTraceAttributes(undefined);
    expect(result).toEqual({});
  });

  test('returns empty object when header is empty string', () => {
    const result = buildTraceAttributes('');
    expect(result).toEqual({});
  });
});
