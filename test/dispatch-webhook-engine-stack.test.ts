import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DispatchWebhookEngineStack } from '../lib/dispatch-webhook-engine-stack';

// Hoisted once for shared use across all describe blocks
const app = new cdk.App();
const stack = new DispatchWebhookEngineStack(app, 'TestStack');
const template = Template.fromStack(stack);

describe('DispatchWebhookEngineStack DynamoDB Tables', () => {
  test('synthesizes exactly two DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 2);
  });

  test('EventsTable is created with correct key schema and billing mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        {
          AttributeName: 'eventId',
          KeyType: 'HASH',
        },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'StatusIndex',
          KeySchema: [
            {
              AttributeName: 'status',
              KeyType: 'HASH',
            },
          ],
          Projection: {
            ProjectionType: 'ALL',
          },
        },
      ],
    });
  });

  test('SubscriptionsTable is created with a composite key schema and billing mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        {
          AttributeName: 'subscriberId',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'eventType',
          KeyType: 'RANGE',
        },
      ],
    });
  });
});

describe('DispatchWebhookEngineStack Ingest Lambda and API Gateway', () => {
  test('Ingest Lambda function is created with Node 22 runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
    });
  });

  test('HTTP API exists with POST /events route wired to a Lambda integration', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /events',
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '2.0',
    });
  });

  test('Ingest Lambda has least-privilege permission to write to DynamoDB', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:PutItem',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Ingest Lambda has least-privilege permission to send message to SQS', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sqs:SendMessage',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('EventsDLQ is created with a 14-day retention period', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      MessageRetentionPeriod: 1209600,
    });
  });

  test('EventsQueue is created with correct visibility timeout and redrive policy', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 180,
      RedrivePolicy: Match.objectLike({
        maxReceiveCount: 3,
      }),
    });
  });
});

describe('DispatchWebhookEngineStack Dispatcher Lambda', () => {
  test('Dispatcher Lambda function is created with Node 22 runtime and a 30s timeout', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'index.handler',
      Timeout: 30,
    });
  });

  test('Dispatcher Lambda is triggered by EventsQueue via SQS event source mapping', () => {
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  test('Dispatcher Lambda has least-privilege permission to read from EventsTable', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:GetItem',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Dispatcher Lambda has least-privilege permission to query SubscriptionsTable', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'dynamodb:Query',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Dispatcher Lambda has permission to read the webhook signing secret', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });
});

describe('DispatchWebhookEngineStack CloudWatch Alarms', () => {
  test('EventsDLQ alarm is created with the correct threshold and evaluation periods', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Threshold: 1,
      EvaluationPeriods: 1,
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Namespace: 'AWS/SQS',
      TreatMissingData: 'notBreaching',
    });
  });
});

describe('DispatchWebhookEngineStack Cognito Authentication', () => {
  test('User Pool exists and only admins can create users', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  test('User Pool Client has OAuth flows disabled', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: Match.absent(),
      CallbackURLs: Match.absent(),
    });
  });

  test('User Pool is deleted with the stack', () => {
    template.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  test('User Pool Client has no secret and allows password auth', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_PASSWORD_AUTH']),
    });
  });

  test('JWT authorizer is configured with an issuer and audience', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Issuer: Match.anyValue(),
        Audience: Match.anyValue(),
      },
    });
  });

  test('POST /events route requires JWT authorization', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /events',
      AuthorizationType: 'JWT',
    });
  });
});
