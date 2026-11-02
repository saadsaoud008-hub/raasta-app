import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const template = JSON.parse(readFileSync(new URL('../infra/workers.cfn.json', import.meta.url), 'utf8'));
it('provides encrypted SQS, bounded poison-message retries, and a dead-letter alarm', () => {
  const resources = template.Resources;
  expect(resources.EventsQueue.Properties.SqsManagedSseEnabled).toBe(true);
  expect(resources.EventsQueue.Properties.RedrivePolicy.maxReceiveCount).toBe(5);
  expect(resources.EventsQueue.Properties.VisibilityTimeout).toBe(120);
  expect(resources.DeadLetterAlarm.Properties.MetricName).toBe('ApproximateNumberOfMessagesVisible');
});
it('deploys workers independently with role credentials and private networking', () => {
  for (const name of ['Notification']) {
    const container = template.Resources[`${name}Task`].Properties.ContainerDefinitions[0];
    expect(container.Command[0]).toBe('node');
    expect(container.Secrets).toHaveLength(1);
    expect(container.Environment.some(entry => entry.Name === 'AWS_ACCESS_KEY_ID')).toBe(false);
    expect(template.Resources[`${name}Service`].Properties.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp).toBe('DISABLED');
    expect(template.Resources[`${name}Service`].Properties.DeploymentConfiguration.DeploymentCircuitBreaker.Rollback).toBe(true);
  }
  expect(template.Resources.WorkerScalingTarget.Properties.MinCapacity).toBe(2);
});

it('gives the API send permission without a separate publisher service', () => {
  expect(template.Resources.PublisherService).toBeUndefined();
  expect(template.Resources.ApiQueuePolicy.Properties.PolicyDocument.Statement[0].Action).toEqual(['sqs:SendMessage']);
});

it('only grants SES sending for the configured identity and sender', () => {
  const condition = template.Resources.NotificationRole.Properties.Policies[0].PolicyDocument.Statement.at(-1)['Fn::If'];
  expect(condition[0]).toBe('EmailEnabled');
  expect(condition[1].Action).toEqual(['ses:SendEmail']);
  expect(condition[1].Resource).toEqual({ Ref: 'SesIdentityArn' });
  expect(condition[1].Condition.StringEquals['ses:FromAddress']).toEqual({ Ref: 'SesFromEmail' });
});
