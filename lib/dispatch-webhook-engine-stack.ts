import { Duration } from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as httpIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
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

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.eventsDLQ = new sqs.Queue(this, 'EventsDLQ', {
      retentionPeriod: Duration.days(14),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.eventsQueue = new sqs.Queue(this, 'EventsQueue', {
      visibilityTimeout: Duration.minutes(2),
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

    this.httpApi = new apigatewayv2.HttpApi(this, 'WebHookHttpApi', {
      apiName: 'dispatch-webhook-engine-api',
    });

    this.httpApi.addRoutes({
      path: '/events',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new httpIntegrations.HttpLambdaIntegration(
        'IngestLambdaIntegration',
        this.ingestFunction
      ),
    });
  }
}
