import { jsonResponse } from '../lambda/shared/response';

describe('jsonResponse', () => {
  test('returns the correct full structure with status, headers, and a stringified body', () => {
    const result = jsonResponse(202, { eventId: 'abc' });

    expect(result).toEqual({
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 'abc' }),
    });
  });

  test('parses the body into the input object', async () => {
    const result = jsonResponse(200, { eventId: 'abc' });

    expect(JSON.parse(result.body!)).toEqual({ eventId: 'abc' });
  });

  test('keeps the custom status code and JSON header for error shapes', async () => {
    const result = jsonResponse(400, { error: 'x' });

    expect(result).toEqual({
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'x' }),
    });
  });
});
