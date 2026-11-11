import { apiClient } from './apiClient';
import { getAccessToken, getTestUsers } from './authHelper';

interface EventResponse {
  eventId: string;
}

interface ErrorResponse {
  error: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('POST /events idempotency (deployed stack)', () => {
  let tokenA: string;
  let tokenB: string;

  const runId = Date.now();

  const eventBody = () => ({
    eventType: 'integration.idempotency',
    payload: { run: Date.now() },
  });

  const headersFor = (token: string, key?: string) => ({
    Authorization: `Bearer ${token}`,
    ...(key !== undefined ? { 'Idempotency-Key': key } : {}),
  });

  beforeAll(async () => {
    const users = getTestUsers();

    [tokenA, tokenB] = await Promise.all([
      getAccessToken(users[0]),
      getAccessToken(users[1]),
    ]);
  });

  test('same key twice (user A) returns 202 and the same eventId', async () => {
    const key = `idem-${runId}-same`;
    const body = eventBody();

    const first = await apiClient.post<EventResponse>('/events', body, {
      headers: headersFor(tokenA, key),
    });
    const second = await apiClient.post<EventResponse>('/events', body, {
      headers: headersFor(tokenA, key),
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.data.eventId).toMatch(HEX_64);
    expect(second.data.eventId).toBe(first.data.eventId);
  });

  test('different keys (user A) produce different eventIds', async () => {
    const first = await apiClient.post<EventResponse>('/events', eventBody(), {
      headers: headersFor(tokenA, `idem-${runId}-one`),
    });
    const second = await apiClient.post<EventResponse>('/events', eventBody(), {
      headers: headersFor(tokenA, `idem-${runId}-two`),
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.data.eventId).toMatch(HEX_64);
    expect(second.data.eventId).toMatch(HEX_64);
    expect(second.data.eventId).not.toBe(first.data.eventId);
  });

  test('no key twice produces two different UUID eventIds', async () => {
    const first = await apiClient.post<EventResponse>('/events', eventBody(), {
      headers: headersFor(tokenA),
    });
    const second = await apiClient.post<EventResponse>('/events', eventBody(), {
      headers: headersFor(tokenA),
    });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.data.eventId).toMatch(UUID);
    expect(second.data.eventId).toMatch(UUID);
    expect(second.data.eventId).not.toBe(first.data.eventId);
  });

  test('an invalid key returns 400 with an error message', async () => {
    const response = await apiClient.post<ErrorResponse>(
      '/events',
      eventBody(),
      { headers: headersFor(tokenA, 'bad key!') }
    );

    expect(response.status).toBe(400);
    expect(typeof response.data.error).toBe('string');
  });

  test('the same key from user A and user B produces different eventIds', async () => {
    const key = `idem-${runId}-scope`;
    const body = eventBody();

    const fromA = await apiClient.post<EventResponse>('/events', body, {
      headers: headersFor(tokenA, key),
    });
    const fromB = await apiClient.post<EventResponse>('/events', body, {
      headers: headersFor(tokenB, key),
    });

    expect(fromA.status).toBe(202);
    expect(fromB.status).toBe(202);
    expect(fromB.data.eventId).not.toBe(fromA.data.eventId);
  });
});
