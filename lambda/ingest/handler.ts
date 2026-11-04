import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import crypto from 'crypto';
import { buildTraceAttributes, parseTraceId } from '../shared/trace';

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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const rawBody = event.body;

  if (!rawBody) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    writeLog('error', 'Failed to parse request body as JSON', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON format' }),
    };
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

    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "Invalid request: 'eventType' must be a string and 'payload' must be an object.",
      }),
    };
  }

  const tableName = process.env.EVENTS_TABLE_NAME;
  const queueUrl = process.env.EVENTS_QUEUE_URL;

  if (!tableName || !queueUrl) {
    writeLog('error', 'Configuration error: Missing environment variables');

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  const eventId = crypto.randomUUID();
  const item = {
    eventId,
    eventType,
    payload: JSON.stringify(payload),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  // 1. DynamoDB Write
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      })
    );

    writeLog('info', 'Event successfully ingested and saved to DynamoDB', {
      eventId,
    });
  } catch (error) {
    writeLog('error', 'Failed to write event to DynamoDB', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  // Use Lambda's execution environment trace ID for propagation
  const traceHeader = process.env._X_AMZN_TRACE_ID;

  // 2. SQS Send (Independent Try/Catch)
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

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }

  return {
    statusCode: 202,
    body: JSON.stringify({ eventId }),
  };
};
