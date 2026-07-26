# Dispatch Webhook Engine

A TypeScript-based AWS CDK project designed for managing and dispatching webhooks.

## Prerequisites

Ensure you have the following installed on your local machine:

- [Node.js](https://nodejs.org/) (managed via `nvm`)
- [AWS CLI](https://aws.amazon.com/cli/) (configured with appropriate credentials)
- [AWS CDK Toolkit](https://aws.amazon.com/cdk/) (`npm install -g aws-cdk`)

---

## Setup Instructions

Follow these steps to set up your local development environment:

### 1. Clone the Repository

```bash
git clone <repository-url>
cd dispatch-webhook-engine
```

---

### 2. Configure Node.js Version

Switch to the correct Node.js version specified by the project:

- `nvm use`

---

### 3. Install Dependencies

- `npm install`

---

### Useful Commands

- `Build:` npm run build
- `Type-Check:` npm run typecheck
- `Watch Mode:` npm run watch
- `Run Tests:` npm run test
- `Run Linter:` npm run lint
- `Synthesize CloudFormation:` npx cdk synth
- `Compare Stack State:` npx cdk diff
- `Deploy Stack:` npx cdk deploy
