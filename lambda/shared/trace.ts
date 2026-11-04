import type { MessageSystemAttributeValue } from '@aws-sdk/client-sqs';

export function parseTraceId(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const rootPart = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('Root='));

  if (!rootPart) {
    return undefined;
  }

  const value = rootPart.slice('Root='.length);
  return value.length > 0 ? value : undefined;
}

export function buildTraceAttributes(header: string | undefined): {
  MessageSystemAttributes?: { AWSTraceHeader: MessageSystemAttributeValue };
} {
  if (!header) {
    return {};
  }

  return {
    MessageSystemAttributes: {
      AWSTraceHeader: {
        DataType: 'String',
        StringValue: header,
      },
    },
  };
}
