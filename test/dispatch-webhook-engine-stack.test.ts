import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

  test('Ingest Lambda has least-privilege IAM policy scoped to PutItem only', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'dynamodb:PutItem',
            Effect: 'Allow',
          },
        ],
      },
    });
  });
});
