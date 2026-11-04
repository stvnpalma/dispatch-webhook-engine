import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { getSubscriberId } from './claims';
import { json, SUBSCRIPTIONS_TABLE_NAME, writeLog } from './common';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface SubscriptionRecord {
  subscriberId: string;
  eventType: string;
  url: string;
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  const sub = getSubscriberId(event);
  if (!sub) {
    writeLog('ERROR', 'Unauthorized attempt: missing or invalid sub claim');
    return json(401, { error: 'Unauthorized: Missing valid token claims.' });
  }

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: SUBSCRIPTIONS_TABLE_NAME,
        KeyConditionExpression: 'subscriberId = :sub',
        ExpressionAttributeValues: { ':sub': sub },
      })
    );

    const subscriptions = (result.Items ?? []) as SubscriptionRecord[];

    writeLog('INFO', 'Successfully retrieved subscriptions', {
      subscriberId: sub,
      count: subscriptions.length,
    });

    return json(200, subscriptions);
  } catch (error) {
    writeLog('ERROR', 'Failed to query subscriptions from DynamoDB', {
      error: error instanceof Error ? error.message : String(error),
      subscriberId: sub,
    });
    return json(500, { error: 'Internal server error.' });
  }
};
