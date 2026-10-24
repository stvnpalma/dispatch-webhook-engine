import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export function getSubscriberId(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): string | undefined {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  return typeof sub === 'string' && sub.trim().length > 0 ? sub : undefined;
}
