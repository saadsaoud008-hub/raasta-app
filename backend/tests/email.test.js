import { expect, it, vi } from 'vitest';
import { normalizeEmail } from '../src/shared/email.js';
import { rideEvent, notifyRide } from '../src/events/ride-events.js';
import { createEmailSender, SesEmailSender } from '../services/notifications/email.js';
import { deliverEmail } from '../services/notifications/deliver-email.js';
import { consumeBatch } from '../services/notifications/consume.js';

const ride = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rider_id: '11111111-1111-4111-8111-111111111111', status: 'ACCEPTED', updated_at: '2026-11-01T00:00:00Z' };
const event = rideEvent(ride, 'rider@example.com');
const row = { event_id: event.eventId, ride_id: ride.id, email_to: 'rider@example.com', status: 'ACCEPTED' };
const logger = { log: vi.fn(), error: vi.fn() };

function database(state = 'PENDING') {
  const query = vi.fn(async sql => {
    if (sql.includes('RETURNING event_id')) return { rows: state === 'PENDING' ? [row] : [] };
    if (sql.startsWith('SELECT email_state')) return { rows: [{ email_state: state }] };
    return { rows: [], rowCount: 1 };
  });
  return { query };
}

it('does not require AWS credentials when email sending is disabled', () => {
  expect(createEmailSender({})).toBeUndefined();
  expect(normalizeEmail(null)).toBeNull();
  expect(normalizeEmail(' rider@example.com ')).toBe('rider@example.com');
});
it.each(['invalid', 'bad\r\nBcc:other@example.com', 'a@b', 123])('rejects invalid email configuration %s', email => {
  expect(() => normalizeEmail(email)).toThrow();
});

it('gets the recipient from saved rider data without changing the stable event ID', async () => {
  const broker = { publish: vi.fn() };
  await notifyRide(broker, ride, logger, async () => 'rider@example.com');
  expect(broker.publish).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'rider@example.com' }));
  expect(rideEvent(ride).eventId).toBe(event.eventId);
});

it.each(['REQUESTED', 'ACCEPTED', 'CANCELLED', 'COMPLETED'])('builds an SES email for %s without calling real AWS', async status => {
  const client = { send: vi.fn().mockResolvedValue({ MessageId: 'ses-message' }), destroy: vi.fn() };
  const sender = new SesEmailSender(client, 'rides@example.com');
  expect(await sender.send({ ...row, status })).toBe('ses-message');
  const command = client.send.mock.calls[0][0].input;
  expect(command.FromEmailAddress).toBe('rides@example.com');
  expect(command.Destination.ToAddresses).toEqual(['rider@example.com']);
  expect(command.Content.Simple.Subject.Data).toContain('Raasta:');
  expect(command.Content.Simple.Body.Text.Data).toContain(ride.id);
  sender.close();
  expect(client.destroy).toHaveBeenCalled();
});

it('marks email sent before deleting the queue message', async () => {
  const db = database();
  const sender = { send: vi.fn().mockResolvedValue('ses-id') };
  const broker = {
    receive: vi.fn().mockResolvedValue([{ Body: JSON.stringify(event), ReceiptHandle: 'receipt' }]),
    acknowledge: vi.fn(async () => {
      expect(db.query.mock.calls.some(([sql]) => sql.includes("SET email_state='SENT'"))).toBe(true);
    }),
  };
  await consumeBatch(db, broker, undefined, logger, sender);
  expect(sender.send).toHaveBeenCalledOnce();
  expect(broker.acknowledge).toHaveBeenCalledOnce();
});

it.each(['SENT', 'SKIPPED'])('does not send again when email state is %s', async state => {
  const sender = { send: vi.fn() };
  await deliverEmail(database(state), event.eventId, sender);
  expect(sender.send).not.toHaveBeenCalled();
});

it('leaves an in-progress email for retry rather than deleting its message', async () => {
  const sender = { send: vi.fn() };
  await expect(deliverEmail(database('SENDING'), event.eventId, sender)).rejects.toThrow('Another worker');
  expect(sender.send).not.toHaveBeenCalled();
});

it('keeps the queue message and resets pending state when SES fails', async () => {
  const db = database();
  const sender = { send: vi.fn().mockRejectedValue(new Error('SES unavailable')) };
  const broker = { receive: vi.fn().mockResolvedValue([{ Body: JSON.stringify(event), ReceiptHandle: 'receipt' }]), acknowledge: vi.fn() };
  await consumeBatch(db, broker, undefined, logger, sender);
  expect(broker.acknowledge).not.toHaveBeenCalled();
  expect(db.query.mock.calls.some(([sql]) => sql.includes("SET email_state='PENDING'"))).toBe(true);
});

it('records a missing recipient as skipped instead of inventing an email address', async () => {
  const db = database('SKIPPED');
  const sender = { send: vi.fn() };
  const broker = { receive: vi.fn().mockResolvedValue([{ Body: JSON.stringify(rideEvent(ride)), ReceiptHandle: 'receipt' }]), acknowledge: vi.fn() };
  await consumeBatch(db, broker, undefined, logger, sender);
  const insert = db.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO notifications.inbox'));
  expect(insert[1].slice(-3)).toEqual([null, 'SKIPPED', 'missing_recipient']);
  expect(sender.send).not.toHaveBeenCalled();
  expect(broker.acknowledge).toHaveBeenCalled();
});
