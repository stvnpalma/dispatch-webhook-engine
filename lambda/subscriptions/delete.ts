import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { getSubscriberId } from './claims';
import { json, SUBSCRIPTIONS_TABLE_NAME, writeLog } from './common';

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

  const rawEventType = event.pathParameters?.eventType;
  if (!rawEventType || rawEventType.trim() === '') {
    return json(400, { error: 'Missing or invalid eventType path parameter.' });
  }

  const eventType = rawEventType.trim();

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: SUBSCRIPTIONS_TABLE_NAME,
        Key: {
          subscriberId: sub,
          eventType,
        },
      })
    );

    writeLog('INFO', 'Subscription deleted', { subscriberId: sub, eventType });

    // 204 No Content for idempotent delete (succeeds whether row existed or not)
    return {
      statusCode: 204,
    };
  } catch (error) {
    writeLog('ERROR', 'Failed to delete subscription from DynamoDB', {
      error: error instanceof Error ? error.message : String(error),
      subscriberId: sub,
      eventType,
    });
    return json(500, { error: 'Internal server error.' });
  }
};
