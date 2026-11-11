import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler } from '../lambda/ingest/handler';

function createMockEvent(
  sub: string,
  idempotencyKey?: string,
  body = { eventType: 'order.created', payload: { id: 1 } }
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'POST /ingest',
    rawPath: '/ingest',
    rawQueryString: '',
    headers: {
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      'content-type': 'application/json',
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'id.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'id',
      http: {
        method: 'POST',
        path: '/ingest',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'Jest',
      },
      requestId: 'req-id',
      routeKey: 'POST /ingest',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 1767225600000,
      authorizer: {
        jwt: {
          claims: { sub },
          scopes: ['openid'],
        },
        principalId: '',
        integrationLatency: 0,
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('Ingest Handler Idempotency Integration Tests', () => {
  const userA = 'sub-user-a';
  let sharedKey: string;

  beforeEach(() => {
    sharedKey = `idem-${Date.now()}`;
    process.env.EVENTS_TABLE_NAME = 'MockEventsTable';
    process.env.EVENTS_QUEUE_URL =
      'https://sqs.us-east-1.amazonaws.com/123/MockQueue';
  });

  test('same key twice (user A) -> both 202, identical eventId', async () => {
    const event1 = createMockEvent(userA, sharedKey);
    const event2 = createMockEvent(userA, sharedKey);

    const res1 = (await handler(event1)) as {
      statusCode: number;
      body?: string;
    };
    const res2 = (await handler(event2)) as {
      statusCode: number;
      body?: string;
    };

    expect(res1.statusCode).toEqual(202);
    expect(res2.statusCode).toEqual(202);

    const body1 = JSON.parse(res1.body ?? '{}') as { eventId: string };
    const body2 = JSON.parse(res2.body ?? '{}') as { eventId: string };

    expect(body1.eventId).toBeDefined();
    expect(body1.eventId).toEqual(body2.eventId);
  });

  test('different keys (user A) -> different eventIds', async () => {
    const event1 = createMockEvent(userA, `idem-1-${Date.now()}`);
    const event2 = createMockEvent(userA, `idem-2-${Date.now()}`);

    const res1 = (await handler(event1)) as {
      statusCode: number;
      body?: string;
    };
    const res2 = (await handler(event2)) as {
      statusCode: number;
      body?: string;
    };

    expect(res1.statusCode).toEqual(202);
    expect(res2.statusCode).toEqual(202);

    const body1 = JSON.parse(res1.body ?? '{}') as { eventId: string };
    const body2 = JSON.parse(res2.body ?? '{}') as { eventId: string };

    expect(body1.eventId).not.toEqual(body2.eventId);
  });

  test('no key twice -> different eventIds', async () => {
    const event1 = createMockEvent(userA, undefined);
    const event2 = createMockEvent(userA, undefined);

    const res1 = (await handler(event1)) as {
      statusCode: number;
      body?: string;
    };
    const res2 = (await handler(event2)) as {
      statusCode: number;
      body?: string;
    };

    expect(res1.statusCode).toEqual(202);
    expect(res2.statusCode).toEqual(202);

    const body1 = JSON.parse(res1.body ?? '{}') as { eventId: string };
    const body2 = JSON.parse(res2.body ?? '{}') as { eventId: string };

    expect(body1.eventId).not.toEqual(body2.eventId);
  });

  test('invalid key bad key!', async () => {
    const event = createMockEvent(userA, 'bad key');
    const res = (await handler(event)) as { statusCode: number; body?: string };

    expect(res.statusCode).toEqual(400);
    const body = JSON.parse(res.body ?? '{}') as { error: string };
    expect(body.error).toBeDefined();
  });

  test('same key from user A and user B -> different eventIds (scoping)', async () => {
    const userB = 'sub-user-b';
    const eventA = createMockEvent(userA, sharedKey);
    const eventB = createMockEvent(userB, sharedKey);

    const resA = (await handler(eventA)) as {
      statusCode: number;
      body?: string;
    };
    const resB = (await handler(eventB)) as {
      statusCode: number;
      body?: string;
    };

    expect(resA.statusCode).toEqual(202);
    expect(resB.statusCode).toEqual(202);

    const bodyA = JSON.parse(resA.body ?? '{}') as { eventId: string };
    const bodyB = JSON.parse(resB.body ?? '{}') as { eventId: string };

    expect(bodyA.eventId).not.toEqual(bodyB.eventId);
  });
});
