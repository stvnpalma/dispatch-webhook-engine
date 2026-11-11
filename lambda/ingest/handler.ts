import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import crypto from 'crypto';
import { jsonResponse } from '../shared/response';
import { buildTraceAttributes, parseTraceId } from '../shared/trace';
import { getSubscriberId } from '../subscriptions/claims';
import { deriveEventId, parseIdempotencyKey } from './idempotency';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

function writeLog(
  level: 'info' | 'error',
  message: string,
  meta?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      level,
      message,
      traceId: parseTraceId(process.env._X_AMZN_TRACE_ID),
      ...meta,
    })
  );
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  // 1. Get caller using getSubscriberId; return 401 if unauthorized
  const sub = getSubscriberId(event);
  if (!sub) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  // 2. Read and parse 'idempotency-key' header
  const idempotencyHeader = event.headers?.['idempotency-key'];
  const idempotencyResult = parseIdempotencyKey(idempotencyHeader);

  if (!idempotencyResult.ok) {
    return jsonResponse(400, { error: idempotencyResult.error });
  }
  const idempotencyKey = idempotencyResult.key;

  const rawBody = event.body;

  if (!rawBody) {
    return jsonResponse(400, { error: 'Missing request body' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    writeLog('error', 'Failed to parse request body as JSON', {
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(400, { error: 'Invalid JSON format' });
  }

  const { eventType, payload } = body;

  if (
    typeof eventType !== 'string' ||
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    writeLog('error', 'Validation failed: invalid eventType or payload', {
      receivedEventTypeType: typeof eventType,
      receivedPayloadType: Array.isArray(payload) ? 'array' : typeof payload,
    });

    return jsonResponse(400, {
      error:
        "Invalid request: 'eventType' must be a string and 'payload' must be an object.",
    });
  }

  const tableName = process.env.EVENTS_TABLE_NAME;
  const queueUrl = process.env.EVENTS_QUEUE_URL;

  if (!tableName || !queueUrl) {
    writeLog('error', 'Configuration error: Missing environment variables');

    return jsonResponse(500, { error: 'Internal server error' });
  }

  // 3. Derive eventId deterministically if key is present, otherwise random UUID
  const eventId = idempotencyKey
    ? deriveEventId(sub, idempotencyKey)
    : crypto.randomUUID();

  const item = {
    eventId,
    eventType,
    payload: JSON.stringify(payload),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  // 4. DynamoDB Write with ConditionExpression & ConditionalCheckFailedException handling
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(eventId)',
      })
    );

    writeLog('info', 'Event successfully ingested and saved to DynamoDB', {
      eventId,
    });
  } catch (error) {
    if (
      idempotencyKey !== undefined &&
      error instanceof ConditionalCheckFailedException
    ) {
      writeLog('info', 'Idempotent retry: event already stored', { eventId });
      // Continue to SQS send
    } else {
      writeLog('error', 'Failed to write event to DynamoDB', {
        error: error instanceof Error ? error.message : String(error),
      });

      return jsonResponse(500, { error: 'Internal server error' });
    }
  }

  // Use Lambda's execution environment trace ID for propagation
  const traceHeader = process.env._X_AMZN_TRACE_ID;

  // 5. SQS Send and 202 Response
  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ eventId }),
        ...buildTraceAttributes(traceHeader),
      })
    );

    writeLog('info', 'Event ID successfully sent to SQS queue', {
      eventId,
    });
  } catch (error) {
    writeLog('error', 'Failed to send event ID to SQS queue', {
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonResponse(500, { error: 'Internal server error' });
  }

  return jsonResponse(202, { eventId });
};
