import { apiClient } from './apiClient';
import { getAccessToken, getTestUsers } from './authHelper';

describe('POST /events authentication', () => {
  let accessToken: string;

  beforeAll(async () => {
    const users = getTestUsers();

    accessToken = await getAccessToken(users[0]);
  });

  const createTestEvent = () => ({
    eventType: 'integration.test',
    payload: { run: Date.now() },
  });

  test('should return 401 when no Authorization header is provided', async () => {
    const response = await apiClient.post('/events', createTestEvent());
    expect(response.status).toBe(401);
  });

  test('should return 401 when an invalid Bearer token is provided', async () => {
    const response = await apiClient.post('/events', createTestEvent(), {
      headers: {
        Authorization: 'Bearer garbage',
      },
    });

    expect(response.status).toBe(401);
  });

  test('should return 202 and a string eventId when a valid access token is provided', async () => {
    const response = await apiClient.post('/events', createTestEvent(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.status).toBe(202);
    expect(response.data).toHaveProperty('eventId');
    expect(typeof response.data.eventId).toBe('string');
  });
});
