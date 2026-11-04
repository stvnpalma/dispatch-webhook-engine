import { AxiosError } from 'axios';
import { retryWithBackoff } from '../lambda/dispatch/retry';

// Helper to construct mock Axios errors safely without 'any'
function createAxiosError(status?: number): AxiosError {
  const error = new Error(
    status ? `Request failed with status code ${status}` : 'Network Error'
  ) as unknown as AxiosError;
  error.isAxiosError = true;
  if (status) {
    error.response = {
      status,
      statusText: 'Error',
      headers: {},
      config: {} as never,
      data: {},
    };
  }
  return error;
}

describe('retryWithBackoff unit tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('succeeds on the first try and calls function once', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on a 500 error and succeeds on subsequent attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(500))
      .mockResolvedValue('success after retry');

    const promise = retryWithBackoff(fn, 2, 200);

    // Advance timers past the first backoff delay (200ms)
    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('success after retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('retries on an Axios network/timeout error with no response', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError()) // No response object
      .mockResolvedValue('success after network recovery');

    const promise = retryWithBackoff(fn, 2, 200);

    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('success after network recovery');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('does not retry a non-Axios generic error and throws immediately', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new Error('Syntax or parsing error'));

    await expect(retryWithBackoff(fn, 2, 200)).rejects.toThrow(
      'Syntax or parsing error'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('does not retry a 400 client error and throws immediately', async () => {
    const fn = jest.fn().mockRejectedValue(createAxiosError(400));

    await expect(retryWithBackoff(fn, 2, 200)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries a 429 Too Many Requests error', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(429))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, 2, 200);

    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('gives up after reaching max attempts and throws error', async () => {
    const fn = jest.fn().mockRejectedValue(createAxiosError(500));

    const promise = retryWithBackoff(fn, 2, 200);

    const assertionPromise = expect(promise).rejects.toThrow();

    // Advance timers for initial retry (200ms) and second retry (400ms)
    await jest.advanceTimersByTimeAsync(200);
    await jest.advanceTimersByTimeAsync(400);

    await assertionPromise;
    // Initial attempt + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
