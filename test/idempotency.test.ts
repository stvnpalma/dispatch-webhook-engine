import {
  deriveEventId,
  parseIdempotencyKey,
} from '../lambda/ingest/idempotency';

describe('parseIdempotencyKey', () => {
  test('should return ok with undefined key when header is undefined', async () => {
    const result = parseIdempotencyKey(undefined);
    expect(result).toEqual({ ok: true, key: undefined });
  });

  test('should return ok with the provided key when a valid string header is passed', async () => {
    const result = parseIdempotencyKey('order-123');

    expect(result).toEqual({ ok: true, key: 'order-123' });
  });

  test('should return ok when key is exactly 128 characters long', async () => {
    const result = parseIdempotencyKey('a'.repeat(128));
    expect(result).toEqual({ ok: true, key: 'a'.repeat(128) });
  });

  test('should return an error when key exceeds 128 characters (129 characters)', async () => {
    const result = parseIdempotencyKey('a'.repeat(129));
    expect(result).toEqual({ ok: false, error: 'Key is too long' });
  });

  test('should return an error if there is whitespace or empty string ', async () => {
    const result = parseIdempotencyKey('');
    expect(result).toEqual({
      ok: false,
      error: 'cannot be a empty string, or have whitespace',
    });
  });

  test('should return an error if there is whitespace ', async () => {
    const result = parseIdempotencyKey('   ');
    expect(result).toEqual({ ok: false, error: 'contains whitespace ' });
  });

  test('should return an error if the key contains unallowed characters like slashes', async () => {
    const result = parseIdempotencyKey('a/b');

    expect(result).toEqual({ ok: false, error: 'Invalid characters' });
  });
});

describe('deriveEventId', () => {
  test('should return a string matching the 64-character hexadecimal regex pattern', async () => {
    const result = deriveEventId('sub-123', 'order-123');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  test('should return the exact same result when called twice with the same inputs', async () => {
    const result1 = deriveEventId('sub-123', 'order-123');
    const result2 = deriveEventId('sub-123', 'order-123');

    expect(result1).toMatch(result2);
  });

  test('should return different event IDs when the subjects are different', async () => {
    const result1 = deriveEventId('sub-123', 'order-123');
    const result2 = deriveEventId('sub-456', 'order-123');

    expect(result1).not.toEqual(result2);
  });

  test('should return different event IDs when the keys are different', async () => {
    const result1 = deriveEventId('sub-123', 'order-123');
    const result2 = deriveEventId('sub-123', 'order-999');

    expect(result1).not.toEqual(result2);
  });
});
