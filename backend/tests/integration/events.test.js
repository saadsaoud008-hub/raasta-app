import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { migrate } from '../../src/db/migration-runner.js';
import { RideService } from '../../src/services/ride.service.js';
import { storeNotification } from '../../services/notifications/store.js';
import { deliverEmail } from '../../services/notifications/deliver-email.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('direct ride events and notification persistence', () => {
  const schema = `events_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, max: 10 });
  const riderId = '11111111-1111-4111-8111-111111111111';
  const input = { riderId, pickup: 'Gulberg', destination: 'DHA', category: 'ECONOMY' };
  const broker = { publish: vi.fn() };
  const service = new RideService(db, undefined, broker);

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate(db);
    const sql = await readFile(new URL('../../services/notifications/migrations/001_notifications.sql', import.meta.url), 'utf8');
    await db.query(sql.replace('CREATE SCHEMA IF NOT EXISTS notifications;', '').replaceAll('notifications.', `${schema}.`));
    const emailSql = await readFile(new URL('../../services/notifications/migrations/002_email_delivery.sql', import.meta.url), 'utf8');
    await db.query(emailSql.replaceAll('notifications.', `${schema}.`));
  });
  afterAll(async () => {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  beforeEach(async () => {
    broker.publish.mockClear();
    await db.query('TRUNCATE rides,drivers,riders,inbox CASCADE');
    await db.query("INSERT INTO riders(id,name) VALUES($1,'Demo')", [riderId]);
  });

  it('does not create an outbox table and can repeat migrations safely', async () => {
    await migrate(db);
    expect((await db.query('SELECT name FROM migrations ORDER BY name')).rows.map(row => row.name)).toEqual(['001_release']);
    expect((await db.query("SELECT to_regclass('outbox_events') AS name")).rows[0].name).toBeNull();
  });

  it('uses stable event IDs for concurrent booking retries and repeated cancellation', async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 8 }, () => service.create(input, key)));
    expect(new Set(broker.publish.mock.calls.map(([event]) => event.eventId)).size).toBe(1);
    expect((await db.query('SELECT * FROM rides')).rowCount).toBe(1);
    await service.transition(results[0].ride.id, 'CANCELLED');
    await service.transition(results[0].ride.id, 'CANCELLED');
    const calls = broker.publish.mock.calls;
    expect(calls.at(-1)[0].eventId).toBe(calls.at(-2)[0].eventId);
    expect(calls.at(-1)[0].eventId).not.toBe(calls[0][0].eventId);
  });

  it('does not publish a rejected transition', async () => {
    await expect(service.transition(randomUUID(), 'CANCELLED')).rejects.toMatchObject({ code: 'RIDE_NOT_FOUND' });
    expect(broker.publish).not.toHaveBeenCalled();
  });

  it('stores one notification for concurrent duplicate deliveries', async () => {
    await service.create(input, randomUUID());
    const event = broker.publish.mock.calls[0][0];
    const notificationDb = { query: (sql, params) => db.query(sql.replaceAll('notifications.', `${schema}.`), params) };
    await Promise.all(Array.from({ length: 8 }, () => storeNotification(notificationDb, event)));
    expect((await db.query('SELECT * FROM inbox')).rowCount).toBe(1);
  });

  it('claims an email once across concurrent notification workers', async () => {
    await db.query("UPDATE riders SET email='rider@example.com' WHERE id=$1", [riderId]);
    await service.create(input, randomUUID());
    const event = broker.publish.mock.calls[0][0];
    expect(event.recipientEmail).toBe('rider@example.com');
    const notificationDb = { query: (sql, params) => db.query(sql.replaceAll('notifications.', `${schema}.`), params) };
    await storeNotification(notificationDb, event, true);
    const sender = { send: vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return 'ses-test-id';
    }) };
    await Promise.allSettled(Array.from({ length: 8 }, () => deliverEmail(notificationDb, event.eventId, sender)));
    expect(sender.send).toHaveBeenCalledOnce();
    const saved = (await db.query('SELECT email_state,email_message_id FROM inbox')).rows[0];
    expect(saved).toEqual({ email_state: 'SENT', email_message_id: 'ses-test-id' });
  });

  it('keeps failed emails pending so another delivery can retry', async () => {
    await db.query("UPDATE riders SET email='rider@example.com' WHERE id=$1", [riderId]);
    await service.create(input, randomUUID());
    const event = broker.publish.mock.calls[0][0];
    const notificationDb = { query: (sql, params) => db.query(sql.replaceAll('notifications.', `${schema}.`), params) };
    await storeNotification(notificationDb, event, true);
    await expect(deliverEmail(notificationDb, event.eventId, { send: async () => { throw new Error('provider down'); } })).rejects.toThrow();
    expect((await db.query('SELECT email_state FROM inbox')).rows[0].email_state).toBe('PENDING');
    await deliverEmail(notificationDb, event.eventId, { send: async () => 'ses-retry-id' });
    expect((await db.query('SELECT email_state FROM inbox')).rows[0].email_state).toBe('SENT');
  });
});
