import { APIGatewayProxyResultV2 } from 'aws-lambda';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Fatal:Missing required environment variable ${name}  `);
  }
  return value;
}

export const SUBSCRIPTIONS_TABLE_NAME = requireEnv('SUBSCRIPTIONS_TABLE_NAME');

export function writeLog(
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

export function json(
  statusCode: number,
  body?: unknown
): APIGatewayProxyResultV2 {
  const response: APIGatewayProxyResultV2 = {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    response.body = JSON.stringify(body);
  }
  return response;
}
