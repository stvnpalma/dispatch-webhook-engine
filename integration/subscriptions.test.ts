import { apiClient } from './apiClient';
import { getAccessToken, getTestUsers } from './authHelper';

describe('subscription lifecycle and ownership ', () => {
  let tokenA: string;
  let tokenB: string;

  const eventType = `integration.sub.${Date.now()}`;
  const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });

  beforeAll(async () => {
    const users = getTestUsers();

    [tokenA, tokenB] = await Promise.all([
      getAccessToken(users[0]),
      getAccessToken(users[1]),
    ]);
  }, 30000);

  afterAll(async () => {
    try {
      await apiClient.delete(`/subscriptions/${eventType}`, auth(tokenA));
    } catch {
      // Ignore errors if the subscription was never created
    }
  });

  test('should allow User A to create a subscription', async () => {
    const response = await apiClient.post(
      '/subscriptions',
      {
        eventType,
        url: 'https://webhook.site/fb2c6f5b-09c1-4a85-9fe7-170849626c35',
      },
      auth(tokenA)
    );

    expect(response.status).toBe(201);
    expect(response.data.eventType).toBe(eventType);
    expect(response.data.subscriberId).toBeDefined();
  });

  test('should allow User A to list subscriptions and see their created type', async () => {
    const response = await apiClient.get('/subscriptions', auth(tokenA));

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);

    const found = response.data.some(
      (sub: { eventType: string }) => sub.eventType === eventType
    );
    expect(found).toBe(true);
  });

  test('should return 400 when attempting to create a subscription with an insecure HTTP url', async () => {
    const response = await apiClient.post(
      '/subscriptions',
      {
        eventType: `${eventType}.invalid`,
        url: 'http://example.com',
      },
      auth(tokenA)
    );

    expect(response.status).toBe(400);
  });

  test('should isolate subscriptions so User B cannot delete User A subscription', async () => {
    const deleteResponse = await apiClient.delete(
      `/subscriptions/${eventType}`,
      auth(tokenB)
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await apiClient.get('/subscriptions', auth(tokenA));
    expect(listResponse.status).toBe(200);

    const found = listResponse.data.some(
      (sub: { eventType: string }) => sub.eventType === eventType
    );

    expect(found).toBe(true);
  });

  test('should now allow User B to actually delete User A subscription', async () => {
    const deleteResponse = await apiClient.delete(
      `/subscriptions/${eventType}`,
      auth(tokenB)
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await apiClient.get('/subscriptions', auth(tokenA));

    expect(listResponse.status).toBe(200);

    const found = listResponse.data.some(
      (sub: { eventType: string }) => sub.eventType === eventType
    );

    expect(found).toBe(true);
  });

  test('should allow User A to delete their own subscription', async () => {
    const deleteResponse = await apiClient.delete(
      `/subscriptions/${eventType}`,
      auth(tokenA)
    );
    expect(deleteResponse.status).toBe(204);

    const listResponse = await apiClient.get('/subscriptions', auth(tokenA));
    expect(listResponse.status).toBe(200);

    const found = listResponse.data.some(
      (sub: { eventType: string }) => sub.eventType === eventType
    );
    expect(found).toBe(false);
  });
});
