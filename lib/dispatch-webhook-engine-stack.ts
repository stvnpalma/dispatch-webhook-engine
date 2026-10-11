import { Duration } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as httpIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

export class DispatchWebhookEngineStack extends cdk.Stack {
  public readonly eventsTable: dynamodb.Table;
  public readonly subscriptionsTable: dynamodb.Table;
  public readonly ingestFunction: NodejsFunction;
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly eventsQueue: sqs.Queue;
  public readonly eventsDLQ: sqs.Queue;
  public readonly dispatcherFunction: NodejsFunction;
  public readonly webhookSecret: secretsmanager.Secret;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.webhookSecret = new secretsmanager.Secret(
      this,
      'WebhookSigningSecret',
      {
        generateSecretString: {},
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    this.eventsDLQ = new sqs.Queue(this, 'EventsDLQ', {
      retentionPeriod: Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cloudwatch.Alarm(this, 'EventsDLQAlarm', {
      metric: this.eventsDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(3),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Trigger alarm when messages land in Dead Letter Queue',
    });

    this.eventsQueue = new sqs.Queue(this, 'EventsQueue', {
      visibilityTimeout: Duration.minutes(3),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deadLetterQueue: {
        queue: this.eventsDLQ,
        maxReceiveCount: 3,
      },
    });

    this.eventsTable = new dynamodb.Table(this, 'EventsTable', {
      partitionKey: {
        name: 'eventId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.eventsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.subscriptionsTable = new dynamodb.Table(this, 'SubscriptionsTable', {
      partitionKey: {
        name: 'subscriberId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.subscriptionsTable.addGlobalSecondaryIndex({
      indexName: 'EventTypeIndex',
      partitionKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING,
      },
    });
    const logGroup = new logs.LogGroup(this, 'IngestWebhookLambdaLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.ingestFunction = new NodejsFunction(this, 'IngestWebhookLambda', {
      entry: 'lambda/ingest/handler.ts',
      runtime: Runtime.NODEJS_22_X,
      logGroup: logGroup,
      environment: {
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
        EVENTS_QUEUE_URL: this.eventsQueue.queueUrl,
      },
    });

    this.eventsTable.grant(this.ingestFunction, 'dynamodb:PutItem');
    this.eventsQueue.grant(this.ingestFunction, 'sqs:SendMessage');

    const dispatcherLogGroup = new logs.LogGroup(
      this,
      'DispatcherLambdaLogGroup',
      {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    this.dispatcherFunction = new NodejsFunction(this, 'DispatcherLambda', {
      entry: 'lambda/dispatch/handler.ts',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      logGroup: dispatcherLogGroup,
      environment: {
        EVENTS_TABLE_NAME: this.eventsTable.tableName,
        SUBSCRIPTIONS_TABLE_NAME: this.subscriptionsTable.tableName,
        WEBHOOK_SECRET_ARN: this.webhookSecret.secretArn,
      },
    });

    this.eventsTable.grant(this.dispatcherFunction, 'dynamodb:GetItem');
    this.subscriptionsTable.grant(this.dispatcherFunction, 'dynamodb:Query');
    this.webhookSecret.grantRead(this.dispatcherFunction);

    this.dispatcherFunction.addEventSource(
      new SqsEventSource(this.eventsQueue, {
        reportBatchItemFailures: true,
        batchSize: 1,
      })
    );

    this.httpApi = new apigatewayv2.HttpApi(this, 'WebHookHttpApi', {
      apiName: 'dispatch-webhook-engine-api',
    });

    this.userPool = new cognito.UserPool(this, 'WebhookUserPool', {
      selfSignUpEnabled: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('WebhookUserClient', {
      authFlows: {
        userPassword: true,
      },
      generateSecret: false,
      disableOAuth: true,
    });

    const userPoolAuthorizer = new authorizers.HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      this.userPool,
      {
        userPoolClients: [this.userPoolClient],
      }
    );

    this.httpApi.addRoutes({
      path: '/events',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new httpIntegrations.HttpLambdaIntegration(
        'IngestLambdaIntegration',
        this.ingestFunction
      ),
      authorizer: userPoolAuthorizer,
    });

    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: this.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: this.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'ApiUrlOutput', {
      value: this.httpApi.apiEndpoint,
    });
  }
}
