import { buildDeliveryHeaders } from '../lambda/dispatch/headers';

describe('buildDeliveryHeaders', () => {
  it('should build delivery headers containing both the signature and the event ID unchanged', () => {
    const signature = 'abcdef123456';
    const eventId = 'evt_12345';

    const headers = buildDeliveryHeaders(signature, eventId);

    expect(headers).toEqual({
      'X-Webhook-Signature': signature,
      'X-Webhook-Event-Id': eventId,
    });
  });
});
