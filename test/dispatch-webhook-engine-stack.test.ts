import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { DispatchWebhookEngineStack } from "../lib/dispatch-webhook-engine-stack";

test("Stack initializes as an empty stack", () => {
  // GIVEN: Set up an in-memory CDK application
  const app = new App();

  // WHEN: Instantiate your stack inside that app
  const stack = new DispatchWebhookEngineStack(app, "TestStack");

  // THEN: Prepare the synthesized CloudFormation template
  const template = Template.fromStack(stack);

  const resources = template.toJSON().Resources || {};

  // Note: CDKMetadata is only added when synthesized via the CDK CLI (which reads
  // cdk.json context). A bare `new App()` here has no context loaded, so a truly
  // empty stack has zero resources in this test's isolated synthesis.
  expect(Object.keys(resources).length).toBe(0);
});
