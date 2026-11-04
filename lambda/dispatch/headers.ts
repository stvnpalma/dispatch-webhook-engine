export function buildDeliveryHeaders(
  signature: string,
  eventId: string
): Record<string, string> {
  return {
    'X-Webhook-Signature': signature,
    'X-Webhook-Event-Id': eventId,
  };
}
