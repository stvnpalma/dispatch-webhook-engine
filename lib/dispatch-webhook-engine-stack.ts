import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class DispatchWebhookEngineStack extends cdk.Stack {
  public readonly eventsTable: dynamodb.Table;
  public readonly subscriptionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.eventsTable = new dynamodb.Table(this, "EventsTable", {
      partitionKey: {
        name: "eventId",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.eventsTable.addGlobalSecondaryIndex({
      indexName: "StatusIndex",
      partitionKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
    });

    this.subscriptionsTable = new dynamodb.Table(this, "SubscriptionsTable", {
      partitionKey: {
        name: "subscriberId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "eventType",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
