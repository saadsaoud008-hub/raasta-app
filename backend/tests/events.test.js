import { it, expect, vi } from 'vitest';
import { RideService } from '../src/services/ride.service.js';
import { rideEvent, notifyRide } from '../src/events/ride-events.js';
import { consumeBatch } from '../services/notifications/consume.js';
import { parseEvent } from '../services/notifications/store.js';
import { SqsBroker, createBroker } from '../src/events/sqs.js';
import { migrate, migrations } from '../src/db/migration-runner.js';

const ride = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rider_id: '11111111-1111-4111-8111-111111111111',
  status: 'REQUESTED', updated_at: '2026-11-01T00:00:00Z',
};
const event = rideEvent(ride);
const logger = { log: vi.fn(), error: vi.fn() };
const message = { MessageId: 'sqs-id', ReceiptHandle: 'receipt', Body: JSON.stringify(event) };

function database({ existing = false, status = 'REQUESTED', failCommit = false } = {}) {
  const query = vi.fn(async sql => {
    if (sql === 'COMMIT' && failCommit) throw new Error('Commit failed');
    if (sql.includes('SELECT id FROM riders')) return { rowCount: 1, rows: [{ id: ride.rider_id }] };
    if (sql.includes('SELECT id,rider_id')) return { rows: [] };
    if (sql.startsWith('INSERT INTO rides')) return { rowCount: 1, rows: [{ id: ride.id }] };
    if (sql.includes('FOR UPDATE')) return { rows: [{ ...ride, status }] };
    if (sql.includes('LEFT JOIN')) return { rows: [{ ...ride, status: existing ? status : 'CANCELLED' }] };
    return { rowCount: 0, rows: [] };
  });
  return { query, db: { query, connect: async () => ({ query, release() {} }) } };
}

it('publishes directly only after committing a ride change', async () => {
  const { db, query } = database();
  const broker = { publish: vi.fn(async event => {
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(event).toMatchObject({ rideId: ride.id, type: 'ride.cancelled' });
  }) };
  await new RideService(db, undefined, broker).transition(ride.id, 'CANCELLED');
  expect(broker.publish).toHaveBeenCalledOnce();
  expect(query.mock.calls.some(([sql]) => sql.includes('outbox'))).toBe(false);
});

it('never publishes a rolled-back ride change', async () => {
  const { db, query } = database({ failCommit: true });
  const broker = { publish: vi.fn() };
  await expect(new RideService(db, undefined, broker).transition(ride.id, 'CANCELLED')).rejects.toThrow('Commit failed');
  expect(query).toHaveBeenCalledWith('ROLLBACK');
  expect(broker.publish).not.toHaveBeenCalled();
});

it('keeps a committed ride successful when SQS fails', async () => {
  const { db, query } = database();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const broker = { publish: vi.fn().mockRejectedValue(new Error('SQS down')) };
    expect(await new RideService(db, undefined, broker).transition(ride.id, 'CANCELLED')).toMatchObject({ status: 'CANCELLED' });
    expect(query).toHaveBeenCalledWith('COMMIT');
    expect(query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(error).toHaveBeenCalled();
  } finally { error.mockRestore(); }
});

it('gives duplicate status notifications the same ID and different statuses different IDs', () => {
  expect(rideEvent(ride).eventId).toBe(rideEvent(ride).eventId);
  expect(rideEvent({ ...ride, status: 'CANCELLED' }).eventId).not.toBe(event.eventId);
  expect(parseEvent(JSON.stringify(event))).toEqual(event);
});

it('can resend a same-state action using the same event ID', async () => {
  const { db } = database({ existing: true, status: 'CANCELLED' });
  const broker = { publish: vi.fn() };
  const service = new RideService(db, undefined, broker);
  await service.transition(ride.id, 'CANCELLED');
  await service.transition(ride.id, 'CANCELLED');
  expect(broker.publish.mock.calls[0][0].eventId).toBe(broker.publish.mock.calls[1][0].eventId);
});

it('publishes a new booking after commit', async () => {
  const { db, query } = database();
  const broker = { publish: vi.fn(async () => expect(query).toHaveBeenCalledWith('COMMIT')) };
  await new RideService(db, undefined, broker).create({ riderId: ride.rider_id, pickup: 'Gulberg', destination: 'DHA', category: 'ECONOMY' }, event.eventId);
  expect(broker.publish).toHaveBeenCalledOnce();
});

it('does nothing when queue notifications are disabled', async () => {
  await expect(notifyRide(undefined, ride, logger)).resolves.toBeUndefined();
});

it('stores notifications before acknowledging and uses a duplicate-safe insert', async () => {
  const db = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
  const broker = { receive: vi.fn().mockResolvedValue([message, message]), acknowledge: vi.fn(async () => expect(db.query).toHaveBeenCalled()) };
  await consumeBatch(db, broker, undefined, logger);
  expect(db.query).toHaveBeenCalledTimes(2);
  expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT(event_id) DO NOTHING');
  expect(db.query.mock.calls[0][1][0]).toBe(event.eventId);
  expect(broker.acknowledge).toHaveBeenCalledTimes(2);
});

it('does not acknowledge database failures or malformed messages', async () => {
  const db = { query: vi.fn().mockRejectedValue(new Error('database down')) };
  const broker = { receive: vi.fn().mockResolvedValue([message, { ...message, Body: '{}' }]), acknowledge: vi.fn() };
  await consumeBatch(db, broker, undefined, logger);
  expect(broker.acknowledge).not.toHaveBeenCalled();
});

it('isolates a bad message so other messages in a batch still succeed', async () => {
  const db = { query: vi.fn().mockResolvedValue({}) };
  const broker = { receive: vi.fn().mockResolvedValue([{ ...message, Body: '{' }, message]), acknowledge: vi.fn() };
  await consumeBatch(db, broker, undefined, logger);
  expect(broker.acknowledge).toHaveBeenCalledOnce();
});

it('keeps notification database concurrency within its five-connection budget', async () => {
  let active = 0;
  let peak = 0;
  const db = { query: vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
  }) };
  const broker = { receive: vi.fn().mockResolvedValue(Array.from({ length: 10 }, () => message)), acknowledge: vi.fn() };
  await consumeBatch(db, broker, undefined, logger);
  expect(peak).toBe(5);
  expect(broker.acknowledge).toHaveBeenCalledTimes(10);
});

it.each([
  { ...event, version: 2 }, { ...event, type: 'ride.completed' },
  { ...event, eventId: 'invalid' }, { ...event, occurredAt: 'invalid' },
  { ...event, status: 'toString' }, null,
])('rejects unsupported or corrupt events', value => {
  expect(() => parseEvent(JSON.stringify(value))).toThrow();
});

it('configures bounded SQS batches, long polling, and explicit acknowledgements', async () => {
  const client = { send: vi.fn().mockResolvedValue({ Messages: [message] }), destroy: vi.fn() };
  const broker = new SqsBroker(client, 'queue-url');
  await broker.publish(event);
  expect(client.send.mock.calls[0][0].input.MessageBody).toBe(JSON.stringify(event));
  await broker.receive();
  expect(client.send.mock.calls[1][0].input).toMatchObject({ MaxNumberOfMessages: 10, WaitTimeSeconds: 20, VisibilityTimeout: 120 });
  await broker.acknowledge('receipt');
  expect(client.send.mock.calls[2][0].input.ReceiptHandle).toBe('receipt');
  broker.close();
  expect(client.destroy).toHaveBeenCalled();
});

it('allows importing the broker without credentials and rejects missing worker configuration', () => {
  expect(() => createBroker({})).toThrow('SQS_QUEUE_URL');
  expect(() => createBroker({ SQS_QUEUE_URL: 'http://example/queue' })).toThrow('HTTPS');
  expect(() => createBroker({ SQS_QUEUE_URL: 'https://example/queue.fifo' })).toThrow('standard queue');
});

it('keeps new installations free of an outbox table and skips applied migrations', async () => {
  const query = vi.fn(async sql => ({ rowCount: sql.startsWith('SELECT 1 FROM') ? 1 : 0, rows: [] }));
  await migrate({ connect: async () => ({ query, release() {} }) });
  expect(migrations.map(([name]) => name)).toEqual(['001_release']);
  expect(query.mock.calls.some(([sql]) => sql.includes('CREATE TABLE riders'))).toBe(false);
  expect(query).toHaveBeenCalledWith('COMMIT');
});

it('rolls back schema updates on migration failure', async () => {
  const query = vi.fn(async sql => {
    if (sql.startsWith('SELECT 1 FROM')) return { rowCount: 0 };
    if (sql.includes('CREATE TABLE riders')) throw new Error('Migration failed');
    return { rows: [] };
  });
  await expect(migrate({ connect: async () => ({ query, release() {} }) })).rejects.toThrow('Migration failed');
  expect(query).toHaveBeenCalledWith('ROLLBACK');
  expect(query).not.toHaveBeenCalledWith('COMMIT');
});
