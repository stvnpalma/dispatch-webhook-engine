import axios from 'axios';

export function shouldRetry(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (!error.response) return true; // Network error or timeout
    const status = error.response.status;
    return status >= 500 || status === 408 || status === 429;
  }
  return false; // Do not retry non-Axios errors (e.g., syntax or parsing errors)
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 2, // 2 retries = 3 total attempts
  delay = 200
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || !shouldRetry(error)) {
      throw error;
    }

    // Wait for the current delay period before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Recursively call with reduced retries and doubled delay (exponential backoff)
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}
