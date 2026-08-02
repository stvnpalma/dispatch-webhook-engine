import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DispatchWebhookEngineStack } from "../lib/dispatch-webhook-engine-stack";

describe("DispatchWebhookEngineStack DynamoDB Tables", () => {
  const app = new cdk.App();
  const stack = new DispatchWebhookEngineStack(app, "TestStack");
  const template = Template.fromStack(stack);

  test("synthesizes exactly two DynamoDB tables", () => {
    template.resourceCountIs("AWS::DynamoDB::Table", 2);
  });

  test("EventsTable is created with correct key schema and billing mode", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        {
          AttributeName: "eventId",
          KeyType: "HASH",
        },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "StatusIndex",
          KeySchema: [
            {
              AttributeName: "status",
              KeyType: "HASH",
            },
          ],
          Projection: {
            ProjectionType: "ALL",
          },
        },
      ],
    });
  });

  test("SubscriptionsTable is created with a composite key schema and billing mode", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        {
          AttributeName: "subscriberId",
          KeyType: "HASH",
        },
        {
          AttributeName: "eventType",
          KeyType: "RANGE",
        },
      ],
    });
  });
});
