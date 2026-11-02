import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { getTestUsers } from './authHelper';
import { deleteUsers } from './cognitoUsers';

export default async function globalTeardown() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const userPoolId = process.env.USER_POOL_ID;
  const rawUsers = process.env.TEST_CREATED_USERS;

  if (!userPoolId || !rawUsers) {
    return;
  }

  const client = new CognitoIdentityProviderClient({ region });
  const userToClean = getTestUsers();

  await deleteUsers(client, userPoolId, userToClean);
}
