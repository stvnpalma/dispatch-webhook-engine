import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSHandler } from 'aws-lambda';
import axios from 'axios';
import * as crypto from 'crypto';

// ==========================================
// 1. CONFIGURATION & ENVIRONMENT GUARDS
// ==========================================
const EVENTS_TABLE_NAME = process.env.EVENTS_TABLE_NAME;
const SUBSCRIPTIONS_TABLE_NAME = process.env.SUBSCRIPTIONS_TABLE_NAME;
const WEBHOOK_SECRET_ARN = process.env.WEBHOOK_SECRET_ARN;

if (!EVENTS_TABLE_NAME || !SUBSCRIPTIONS_TABLE_NAME || !WEBHOOK_SECRET_ARN) {
  throw new Error(
    'Fatal: Missing required environment variables (EVENTS_TABLE_NAME, SUBSCRIPTIONS_TABLE_NAME, WEBHOOK_SECRET_ARN)'
  );
}

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const secretsClient = new SecretsManagerClient({});

let cachedSecret: string | undefined;

// ==========================================
// 2. TYPES & STRUCTURED LOGGING HELPER
// ==========================================
interface EventItem {
  eventId: string;
  eventType: string;
  payload: string;
}

interface SubscriptionItem {
  url: string;
  eventType: string;
}

function writeLog(
  level: 'INFO' | 'ERROR',
  message: string,
  meta?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    })
  );
}

async function getWebhookSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const command = new GetSecretValueCommand({
    SecretId: WEBHOOK_SECRET_ARN,
  });

  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error(
      'WEBHOOK_SECRET_ARN is missing or does not contain a SecretString.'
    );
  }

  cachedSecret = response.SecretString;
  return cachedSecret;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// ==========================================
// 3. MAIN HANDLER
// ==========================================
export const handler: SQSHandler = async (event) => {
  // If records array is empty, exit early without calling Secrets Manager
  if (!event.Records || event.Records.length === 0) {
    writeLog('INFO', 'Received empty SQS batch');
    return { batchItemFailures: [] };
  }

  const secret = await getWebhookSecret();
  const failedMessageIds: string[] = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body) as unknown;

      if (typeof body !== 'object' || body === null || !('eventId' in body)) {
        throw new Error('Invalid message body structure: missing eventId');
      }

      const eventId = (body as { eventId: string }).eventId;

      const eventResult = await ddbDocClient.send(
        new GetCommand({
          TableName: EVENTS_TABLE_NAME,
          Key: { eventId },
        })
      );

      const item = eventResult.Item as EventItem | undefined;
      if (
        !item ||
        typeof item.eventType !== 'string' ||
        typeof item.payload !== 'string'
      ) {
        writeLog('ERROR', 'Event not found or missing required fields', {
          eventId,
          messageId: record.messageId,
        });
        failedMessageIds.push(record.messageId);
        continue;
      }

      const { eventType, payload } = item;

      const subsResult = await ddbDocClient.send(
        new QueryCommand({
          TableName: SUBSCRIPTIONS_TABLE_NAME,
          IndexName: 'EventTypeIndex',
          KeyConditionExpression: 'eventType = :et',
          ExpressionAttributeValues: { ':et': eventType },
        })
      );

      const subscribers = (subsResult.Items ?? []) as SubscriptionItem[];
      if (subscribers.length === 0) {
        writeLog('INFO', 'No subscribers found for event type', {
          eventType,
          eventId,
        });
        continue;
      }

      let recordFailed = false;
      for (const sub of subscribers) {
        if (typeof sub.url !== 'string') {
          writeLog('ERROR', 'Subscription has invalid URL type', { eventId });
          continue;
        }

        try {
          const signature = signPayload(payload, secret);
          await axios.post(sub.url, JSON.parse(payload), {
            headers: { 'X-Webhook-Signature': signature },
            timeout: 5000,
          });
        } catch (error) {
          if (axios.isAxiosError(error)) {
            writeLog('ERROR', 'Failed to deliver webhook', {
              url: sub.url,
              status: error.response?.status,
              errorMessage: error.message,
            });
          } else {
            writeLog('ERROR', 'Unexpected error delivering webhook', {
              url: sub.url,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          recordFailed = true;
        }
      }

      if (recordFailed) {
        failedMessageIds.push(record.messageId);
      }
    } catch (error) {
      writeLog('ERROR', 'Failed to process SQS record', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      failedMessageIds.push(record.messageId);
    }
  }

  return {
    batchItemFailures: failedMessageIds.map((id) => ({ itemIdentifier: id })),
  };
};
