import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

export async function deleteUsers(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  usernames: string[]
): Promise<void> {
  for (const username of usernames) {
    try {
      await client.send(
        new AdminDeleteUserCommand({
          UserPoolId: userPoolId,
          Username: username,
        })
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Failed to delete test user ${username}: ${errorMessage}`);
    }
  }
}
