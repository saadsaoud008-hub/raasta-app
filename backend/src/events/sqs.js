import {
  SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

export function createBroker(env = process.env) {
  if (!env.SQS_QUEUE_URL) throw new Error('SQS_QUEUE_URL is required for queue publishing or consumption.');
  const queueUrl = new URL(env.SQS_QUEUE_URL);
  if (!['https:', 'http:'].includes(queueUrl.protocol) || queueUrl.pathname.endsWith('.fifo'))
    throw new Error('Configure an HTTP(S) SQS standard queue URL.');
  if (queueUrl.protocol !== 'https:' && !env.SQS_ENDPOINT_URL)
    throw new Error('AWS queues require HTTPS; set SQS_ENDPOINT_URL for a local emulator.');
  const client = new SQSClient({
    region: env.AWS_REGION || 'us-east-1',
    ...(env.SQS_ENDPOINT_URL ? { endpoint: env.SQS_ENDPOINT_URL } : {}),
    // AWS uses its normal role/credential chain. Local credentials are explicit env vars.
    maxAttempts: 3,
  });
  return new SqsBroker(client, env.SQS_QUEUE_URL);
}

export class SqsBroker {
  constructor(client, queueUrl) { this.client = client; this.queueUrl = queueUrl; }
  async publish(event) {
    await this.client.send(new SendMessageCommand({
      QueueUrl: this.queueUrl, MessageBody: JSON.stringify(event),
    }), { abortSignal: AbortSignal.timeout(2000) });
  }
  async receive(signal) {
    const result = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: this.queueUrl, MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20, VisibilityTimeout: 120,
    }), { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    return result.Messages || [];
  }
  async acknowledge(receipt) {
    await this.client.send(new DeleteMessageCommand({
      QueueUrl: this.queueUrl, ReceiptHandle: receipt,
    }), { abortSignal: AbortSignal.timeout(10000) });
  }
  close() { this.client.destroy(); }
}
