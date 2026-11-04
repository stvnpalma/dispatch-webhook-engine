import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import axios from 'axios';
import crypto from 'crypto';
import { apiClient } from './apiClient';
import { getAccessToken, getTestUsers } from './authHelper';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getHeader(
  headers: Record<string, string | string[]>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      const val = headers[key];
      return Array.isArray(val) ? val[0] : val;
    }
  }
  return undefined;
}

interface WebhookSiteRequest {
  id: string;
  uuid: string;
  url: string;
  method: string;
  ip: string;
  headers: Record<string, string | string[]>;
  content: string;
  timestamp: string;
}

interface WebhookSiteResponse {
  data: WebhookSiteRequest[];
  total: number;
}

async function pollForRequest(
  tokenUuid: string,
  timeoutMs: number = 30000
): Promise<WebhookSiteRequest> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await axios.get<WebhookSiteResponse>(
        `https://webhook.site/token/${tokenUuid}/requests`
      );

      const requests = response.data.data;
      if (requests && requests.length > 0) {
        return requests[0];
      }
    } catch (error) {
      console.warn(
        'Polling error...',
        error instanceof Error ? error.message : String(error)
      );
    }

    await sleep(pollInterval);
  }

  throw new Error(
    `Timed out waiting for webhook request on token ${tokenUuid} after ${timeoutMs}ms`
  );
}

describe('end-to-end webhook delivery', () => {
  let tokenUuid: string;
  let accessToken: string;
  let signingSecret: string;
  let eventType: string;

  beforeAll(async () => {
    eventType = `test.event.${Date.now()}`;

    if (!process.env.WEBHOOK_SECRET_ARN) {
      throw new Error('WEBHOOK_SECRET_ARN environment variable is missing');
    }
    const tokenResponse = await axios.post('https://webhook.site/token');
    tokenUuid = tokenResponse.data.uuid;

    const testUsers = getTestUsers();
    const userA = testUsers[0];
    accessToken = await getAccessToken(userA);

    const secretsManager = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    const secretResponse = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: process.env.WEBHOOK_SECRET_ARN })
    );

    if (!secretResponse.SecretString) {
      throw new Error('SecretString is missing from the secret response.');
    }
    signingSecret = secretResponse.SecretString;

    const subscriptionResponse = await apiClient.post(
      '/subscriptions',
      {
        eventType,
        url: `https://webhook.site/${tokenUuid}`,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    expect(expect(subscriptionResponse.status).toBe(201));
  }, 30000);

  afterAll(async () => {
    if (accessToken) {
      await apiClient.delete(`/subscriptions/${eventType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (tokenUuid) {
      try {
        await axios.delete(`https://webhook.site/token/${tokenUuid}`);
      } catch (error) {
        console.warn(
          'Failed to delete webhook.site token during cleanup:',
          error
        );
      }
    }
  });

  test('delivers a signed payload with a matching event ID header', async () => {
    const payload = { orderId: '123456' };

    const requestBody = {
      eventType,
      payload,
    };

    const eventResponse = await apiClient.post('/events', requestBody, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(eventResponse.status).toBe(202);
    const eventId = eventResponse.data.eventId;
    expect(eventId).toBeDefined();

    const receivedRequest = await pollForRequest(tokenUuid);

    const parsedBody = JSON.parse(receivedRequest.content);
    expect(parsedBody).toEqual(payload);

    const receivedEventId = getHeader(
      receivedRequest.headers,
      'x-webhook-event-id'
    );
    expect(receivedEventId).toBe(eventId);

    const receivedSignature = getHeader(
      receivedRequest.headers,
      'x-webhook-signature'
    );

    const computedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(receivedRequest.content)
      .digest('hex');

    expect(receivedSignature).toBe(computedSignature);
  }, 60000);
});
