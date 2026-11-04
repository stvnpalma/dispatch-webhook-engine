import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { getSubscriberId } from './claims';
import { json, SUBSCRIPTIONS_TABLE_NAME, writeLog } from './common';
import { validateSubscription } from './validation';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const sub = getSubscriberId(event);
  if (!sub) {
    writeLog('ERROR', 'Unauthorized attempt: missing or invalid sub claim');
    return json(401, { error: 'Unauthorized: Missing valid token claims.' });
  }

  if (!event.body) {
    return json(400, { error: 'Missing request body.' });
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(event.body);
  } catch {
    return json(400, { error: 'Invalid JSON format.' });
  }

  const validationResult = validateSubscription(rawBody);
  if (!validationResult.ok) {
    return json(400, { error: validationResult.error });
  }

  const { eventType, url } = validationResult.value;
  const item = { subscriberId: sub, eventType, url };

  try {
    await docClient.send(
      new PutCommand({
        TableName: SUBSCRIPTIONS_TABLE_NAME,
        Item: item,
      })
    );

    writeLog('INFO', 'Subscription successfully created/updated', {
      subscriberId: sub,
      eventType,
    });
    return json(201, item);
  } catch (error) {
    writeLog('ERROR', 'Failed to write subscription to DynamoDB', {
      error: error instanceof Error ? error.message : String(error),
      subscriberId: sub,
    });
    return json(500, { error: 'Internal server error.' });
  }
};
