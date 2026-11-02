import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from 'dotenv';
import * as path from 'path';
import { deleteUsers } from './cognitoUsers';

export default async function globalSetup() {
  config({ path: path.resolve(process.cwd(), '.env.local') });

  const region = process.env.AWS_REGION || 'us-east-1';
  const userPoolId = process.env.USER_POOL_ID;
  const testPassword = process.env.TEST_USER_PASSWORD;

  if (!userPoolId) {
    throw new Error('USER_POOL_ID is not defined in .env.local');
  }

  if (!testPassword) {
    throw new Error('TEST_USER_PASSWORD is not defined in .env.local');
  }

  const client = new CognitoIdentityProviderClient({ region });
  const runId = Date.now();

  const createdUsers: string[] = [];

  try {
    for (const username of [`test-user-1-${runId}`, `test-user-2-${runId}`]) {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: username,
          TemporaryPassword: testPassword,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: `${username}@example.com` },
            { Name: 'email_verified', Value: 'true' },
          ],
        })
      );

      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: username,
          Password: testPassword,
          Permanent: true,
        })
      );

      createdUsers.push(username);
    }

    process.env.TEST_CREATED_USERS = JSON.stringify(createdUsers);
  } catch (error: unknown) {
    console.error('Setup failed partway. Cleaning up partial test users...');
    await deleteUsers(client, userPoolId, createdUsers);
    throw error;
  }
}
