import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { getSubscriberId } from '../lambda/subscriptions/claims';

function eventWithClaims(claims: Record<string, unknown>) {
  return {
    requestContext: { authorizer: { jwt: { claims } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('getSubscriberId', () => {
  test('returns the sub claim when present', () => {
    expect(getSubscriberId(eventWithClaims({ sub: 'abc-123' }))).toBe(
      'abc-123'
    );
  });

  test.each([
    ['missing', {}],
    ['an empty string', { sub: '' }],
    ['whitespace only', { sub: '   ' }],
    ['a non-string', { sub: 42 }],
  ])('returns undefined when sub is %s', (_label, claims) => {
    expect(getSubscriberId(eventWithClaims(claims))).toBeUndefined();
  });
});
