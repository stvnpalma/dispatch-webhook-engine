import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import crypto from 'crypto';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

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
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Failed to parse request body as JSON',
        error: error instanceof Error ? error.message : String(error),
      })
    );

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
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Validation failed: invalid eventType or payload',
        receivedEventTypeType: typeof eventType,
        receivedPayloadType: Array.isArray(payload) ? 'array' : typeof payload,
      })
    );

    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "Invalid request: 'eventType' must be a string and 'payload' must be an object.",
      }),
    };
  }

  const tableName = process.env.EVENTS_TABLE_NAME;

  if (!tableName) {
    console.log(
      JSON.stringify({
        level: 'error',
        message:
          'Configuration error: EVENTS_TABLE_NAME environment variable is not defined',
      })
    );

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

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      })
    );

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Event successfully ingested and saved',
        eventId,
        eventType,
      })
    );

    return {
      statusCode: 202,
      body: JSON.stringify({ eventId }),
    };
  } catch (error) {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Failed to write event to DynamoDB',
        error: error instanceof Error ? error.message : String(error),
      })
    );

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
