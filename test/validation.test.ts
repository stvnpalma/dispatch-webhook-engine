import { validateSubscription } from '../lambda/subscriptions/validation';

describe('Validation Module - DWH-9', () => {
  const validEventType = 'order.created';
  const validUrl = 'https://example.com/webhook';

  test('accepts a valid https URL and eventType', () => {
    const result = validateSubscription({
      eventType: validEventType,
      url: validUrl,
    });
    expect(result).toEqual({
      ok: true,
      value: { eventType: validEventType, url: validUrl },
    });
  });

  test('rejects http: protocol', () => {
    const result = validateSubscription({
      eventType: validEventType,
      url: 'http://example.com/webhook',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects URLs with embedded credentials', () => {
    const result = validateSubscription({
      eventType: validEventType,
      url: 'https://user:pass@example.com/webhook',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects localhost', () => {
    const result = validateSubscription({
      eventType: validEventType,
      url: 'https://localhost/webhook',
    });
    expect(result.ok).toBe(false);
  });

  test('rejects unparseable URLs', () => {
    const result = validateSubscription({
      eventType: validEventType,
      url: 'not a url',
    });
    expect(result.ok).toBe(false);
  });

  test.each([
    'https://127.0.0.1/webhook',
    'https://10.0.0.1/webhook',
    'https://192.168.1.1/webhook',
    'https://169.254.169.254/webhook',
  ])('rejects private and loopback IPv4: %s', (url) => {
    const result = validateSubscription({ eventType: validEventType, url });
    expect(result.ok).toBe(false);
  });

  test.each([
    'https://[::ffff:127.0.0.1]/webhook',
    'https://[fe80::1]/webhook',
    'https://[fc00::1]/webhook',
    'https://[::]/webhook',
    'https://[::1]/webhook',
    'https://0.0.0.0/webhook',
    'https://localhost./webhook',
    'https://api.localhost/webhook',
    'https://2130706433/webhook',
    'https://0x7f.1/webhook',
  ])('rejects internal address: %s', (url) => {
    const result = validateSubscription({ eventType: validEventType, url });
    expect(result.ok).toBe(false);
  });

  test('handles the 172.16.0.0/12 boundary correctly', () => {
    expect(
      validateSubscription({
        eventType: validEventType,
        url: 'https://172.16.0.1/wh',
      }).ok
    ).toBe(false);
    expect(
      validateSubscription({
        eventType: validEventType,
        url: 'https://172.31.255.255/wh',
      }).ok
    ).toBe(false);

    expect(
      validateSubscription({
        eventType: validEventType,
        url: 'https://172.15.255.255/wh',
      }).ok
    ).toBe(true);
    expect(
      validateSubscription({
        eventType: validEventType,
        url: 'https://172.32.0.1/wh',
      }).ok
    ).toBe(true);
  });

  test('rejects empty or whitespace-only eventType', () => {
    expect(validateSubscription({ eventType: '', url: validUrl }).ok).toBe(
      false
    );
    expect(validateSubscription({ eventType: '   ', url: validUrl }).ok).toBe(
      false
    );
  });

  test('rejects eventType with characters unsafe for URL path parameters', () => {
    expect(
      validateSubscription({ eventType: 'order/created', url: validUrl }).ok
    ).toBe(false);
    expect(
      validateSubscription({ eventType: 'order created', url: validUrl }).ok
    ).toBe(false);
    expect(
      validateSubscription({ eventType: 'order%20created', url: validUrl }).ok
    ).toBe(false);
  });

  test('handles eventType length cap (max 256 characters)', () => {
    const maxValidEventType = 'a'.repeat(256);
    const overLengthEventType = 'a'.repeat(257);

    expect(
      validateSubscription({ eventType: maxValidEventType, url: validUrl }).ok
    ).toBe(true);
    expect(
      validateSubscription({ eventType: overLengthEventType, url: validUrl }).ok
    ).toBe(false);
  });

  test('rejects non-object bodies and missing/invalid field types', () => {
    expect(validateSubscription(null).ok).toBe(false);
    expect(validateSubscription(undefined).ok).toBe(false);
    expect(validateSubscription('string-body').ok).toBe(false);
    expect(validateSubscription(['array']).ok).toBe(false);

    expect(validateSubscription({ eventType: 123, url: validUrl }).ok).toBe(
      false
    );
    expect(validateSubscription({ eventType: null, url: validUrl }).ok).toBe(
      false
    );
    expect(validateSubscription({ url: validUrl }).ok).toBe(false);

    expect(
      validateSubscription({ eventType: validEventType, url: 123 }).ok
    ).toBe(false);
    expect(
      validateSubscription({ eventType: validEventType, url: null }).ok
    ).toBe(false);
    expect(validateSubscription({ eventType: validEventType }).ok).toBe(false);
  });
});
