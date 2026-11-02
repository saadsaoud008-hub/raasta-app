import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { normalizeEmail } from '../../src/shared/email.js';

const titles = {
  REQUESTED: 'Your ride was requested',
  ACCEPTED: 'A driver accepted your ride',
  CANCELLED: 'Your ride was cancelled',
  COMPLETED: 'Your ride was completed',
};

export function createEmailSender(env = process.env) {
  const from = normalizeEmail(env.SES_FROM_EMAIL);
  if (!from) return undefined; // Record-only mode remains available without AWS credentials.
  const client = new SESv2Client({ region: env.AWS_REGION || 'us-east-1', maxAttempts: 1 });
  return new SesEmailSender(client, from);
}

export class SesEmailSender {
  constructor(client, from) { this.client = client; this.from = from; }
  async send(notification) {
    const to = normalizeEmail(notification.email_to);
    if (!to || !Object.hasOwn(titles, notification.status)) throw new Error('Invalid email notification.');
    const response = await this.client.send(new SendEmailCommand({
      FromEmailAddress: this.from,
      Destination: { ToAddresses: [to] },
      Content: { Simple: {
        Subject: { Data: `Raasta: ${titles[notification.status]}`, Charset: 'UTF-8' },
        Body: { Text: { Data: `${titles[notification.status]}.\n\nRide ID: ${notification.ride_id}\n\nOpen Raasta to see the latest ride status.`, Charset: 'UTF-8' } },
      } },
      EmailTags: [{ Name: 'event_id', Value: notification.event_id }],
    }), { abortSignal: AbortSignal.timeout(10000) });
    if (!response.MessageId) throw new Error('Email provider did not confirm acceptance.');
    return response.MessageId;
  }
  close() { this.client.destroy(); }
}
