import { apiClient } from './apiClient';
import { getAccessToken, getTestUsers } from './authHelper';

describe('Ingest Integration Tests', () => {
  let token: string;

  beforeAll(async () => {
    const users = await getTestUsers();
    token = await getAccessToken(users[0]);
  });

  test('valid event returns status 202 and JSON content-type', async () => {
    const response = await apiClient.post(
      '/events',
      { eventType: 'user.signup', payload: { userId: '123' } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    expect(response.status).toBe(202);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });

  test('invalid body returns status 400, JSON content-type, and error string', async () => {
    const response = await apiClient.post(
      '/events',
      { eventType: 123, payload: {} },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        validateStatus: () => true,
      }
    );

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(typeof response.data.error).toBe('string');
  });
});
