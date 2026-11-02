import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export async function getAccessToken(username: string): Promise<string> {
  const clientId = process.env.USER_POOL_CLIENT_ID;
  const testPassword = process.env.TEST_USER_PASSWORD;

  if (!clientId) {
    throw new Error(
      'USER_POOL_CLIENT_ID is not defined in environment variables.'
    );
  }

  if (!testPassword) {
    throw new Error(
      'TEST_USER_PASSWORD is not defined in environment variables.'
    );
  }

  const client = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: testPassword,
      },
    })
  );

  if (!response.AuthenticationResult) {
    throw new Error(
      'AuthenticationResult is undefined (possibly a challenge was returned).'
    );
  }
  const accessToken = response.AuthenticationResult.AccessToken;

  if (!accessToken) {
    throw new Error('AccessToken is undefined.');
  }
  return accessToken;
}

export function getTestUsers(): string[] {
  const rawUsers = process.env.TEST_CREATED_USERS;

  if (!rawUsers) {
    throw new Error(
      'TEST_CREATED_USERS is not defined in environment variables.'
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUsers);
  } catch {
    throw new Error('TEST_CREATED_USERS is not valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('TEST_CREATED_USERS is not an array.');
  }

  for (const item of parsed) {
    if (typeof item !== 'string') {
      throw new Error('TEST_CREATED_USERS contains a non-string value.');
    }
  }

  return parsed;
}
